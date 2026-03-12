import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from app.config import API_PREFIX
from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    Repository,
    AnalysisSession,
    SourceFile,
    ImportDependency,
    FileMetrics
)
from app.services.repo_loader import RepositoryLoader
from app.services.file_scanner import FileScanner
from app.services.parser import DependencyParser
from app.services.graph import GraphBuilder
from app.utils.paths import extract_repo_name_from_url

app = FastAPI(
    title="Code Dependency Analyzer",
    description="API для анализа зависимостей в JavaScript/TypeScript проектах",
    version="1.0.0"
)

# CORS middleware для работы с фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация сервисов
repo_loader = RepositoryLoader()
file_scanner = FileScanner()
parser = DependencyParser()
graph_builder = GraphBuilder()

# Хранилище сессий (в продакшене использовать БД)
sessions: Dict[str, dict] = {}


@app.get("/")
def root():
    """Корневой endpoint для проверки работы API."""
    return {
        "status": "ok",
        "service": "Code Dependency Analyzer",
        "version": "1.0.0"
    }


@app.get(f"{API_PREFIX}/health")
def health_check():
    """Проверка здоровья сервиса."""
    return {"status": "healthy"}


@app.post(f"{API_PREFIX}/analyze", response_model=AnalyzeResponse)
async def analyze_repository(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks
):
    """
    Запускает анализ репозитория.
    
    Args:
        request: Запрос с URL репозитория
    
    Returns:
        Ответ с session_id и начальными данными
    """
    repo_url = request.repo_url
    
    # Валидация URL
    if not repo_url or not (repo_url.startswith("http") or repo_url.startswith("git@")):
        raise HTTPException(
            status_code=400,
            detail="Некорректный URL репозитория"
        )
    
    # Создаём сессию
    session_id = str(uuid.uuid4())
    session = {
        "session_id": session_id,
        "repo_url": repo_url,
        "status": "processing",
        "started_at": datetime.now(),
        "finished_at": None,
        "error": None
    }
    sessions[session_id] = session
    
    # Запускаем анализ в фоне
    background_tasks.add_task(process_analysis, session_id, repo_url)
    
    # Возвращаем начальный ответ
    return AnalyzeResponse(
        session_id=session_id,
        status="processing",
        repository=Repository(
            url=repo_url,
            name=extract_repo_name_from_url(repo_url),
            analyzed_at=None
        ),
        files=[],
        graph_data={"nodes": [], "links": []}
    )


@app.get(f"{API_PREFIX}/session/{{session_id}}")
def get_session_status(session_id: str):
    """
    Получает статус сессии анализа.
    
    Args:
        session_id: ID сессии
    
    Returns:
        Информация о сессии
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    session = sessions[session_id]
    return session


@app.get(f"{API_PREFIX}/session/{{session_id}}/result")
def get_analysis_result(session_id: str):
    """
    Получает результат анализа.
    
    Args:
        session_id: ID сессии
    
    Returns:
        Результат анализа с графом
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    
    session = sessions[session_id]
    
    if session["status"] == "processing":
        raise HTTPException(
            status_code=202,
            detail="Анализ ещё выполняется"
        )
    
    if session["status"] == "failed":
        raise HTTPException(
            status_code=500,
            detail=session.get("error", "Ошибка при анализе")
        )
    
    # Возвращаем результат
    return session.get("result", {})


def process_analysis(session_id: str, repo_url: str):
    """
    Обрабатывает анализ репозитория.
    Выполняется в фоновом режиме.
    """
    try:
        session = sessions[session_id]
        session["status"] = "processing"
        
        # 1. Клонируем репозиторий
        repo_path = repo_loader.clone_repository(repo_url)
        session["repo_path"] = str(repo_path)
        
        # 2. Сканируем файлы
        files_data = file_scanner.scan_repository(repo_path)
        
        if not files_data:
            raise Exception("Не найдено поддерживаемых файлов в репозитории")
        
        # 3. Парсим зависимости
        dependencies = parser.parse_files(files_data, repo_path)
        
        # 4. Строим граф
        graph = graph_builder.build_graph(files_data, dependencies)
        graph_data = graph_builder.get_graph_data_for_d3()
        statistics = graph_builder.get_statistics()
        
        # 5. Вычисляем метрики
        metrics = graph_builder.calculate_metrics()
        
        # 6. Формируем результат
        source_files = []
        for file_info in files_data:
            file_path = file_info["file_path"]
            file_deps = dependencies.get(file_path, [])
            
            dependencies_list = [
                ImportDependency(
                    import_path=dep["import_path"],
                    import_type=dep["import_type"]
                )
                for dep in file_deps
            ]
            
            file_metrics = metrics.get(file_path, FileMetrics())
            
            source_files.append(
                SourceFile(
                    file_path=file_path,
                    file_type=file_info["file_type"],
                    sloc=file_info["sloc"],
                    dependencies=dependencies_list,
                    metrics=file_metrics
                )
            )
        
        repository = Repository(
            url=repo_url,
            name=extract_repo_name_from_url(repo_url),
            analyzed_at=datetime.now()
        )
        
        # Сохраняем результат
        session["status"] = "completed"
        session["finished_at"] = datetime.now()
        session["result"] = {
            "session_id": session_id,
            "status": "completed",
            "repository": repository.dict(),
            "files": [f.dict() for f in source_files],
            "graph_data": graph_data,
            "statistics": statistics
        }
        
    except Exception as e:
        session["status"] = "failed"
        session["finished_at"] = datetime.now()
        session["error"] = str(e)
        import traceback
        session["traceback"] = traceback.format_exc()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
