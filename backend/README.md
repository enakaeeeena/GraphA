# Code Dependency Analyzer Backend

Бэкенд-сервис для анализа зависимостей в JavaScript/TypeScript проектах. Позволяет загружать репозитории из GitHub и визуализировать связи между файлами через графы.

## Архитектура

Проект использует FastAPI и состоит из следующих компонентов:

- **Repository Loader** - клонирование репозиториев из GitHub
- **File Scanner** - поиск и сканирование JS/TS файлов
- **Parser** - парсинг импортов и зависимостей
- **Graph Builder** - построение графов зависимостей с использованием NetworkX

## Установка

1. Убедитесь, что у вас установлен Python 3.10+ (рекомендуется). На Windows можно использовать `py`.

2. Создайте виртуальное окружение:
```bash
py -m venv venv
```

3. Активируйте виртуальное окружение:
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

4. Установите зависимости:
```bash
pip install -r requirements.txt
```

## Запуск

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Или через Python:
```bash
py -m app.main
```

API будет доступен по адресу: `http://localhost:8000`

Документация API (Swagger): `http://localhost:8000/docs`

## API Endpoints

### POST `/api/v1/projects`
Создать проект (сохраняется в SQLite).

**Request:**
```json
{
  "name": "my-project",
  "repo_url": "https://github.com/user/repo.git"
}
```

### POST `/api/v1/projects/{project_id}/analyze`
Запустить анализ проекта. Создаёт `AnalysisRun` и сохраняет снапшот (файлы/зависимости/метрики) в БД.

### GET `/api/v1/runs/{run_id}`
Получить статус запуска анализа (`processing/completed/failed`).

### GET `/api/v1/projects/{project_id}/graph?run_id=...`
Получить граф зависимостей (формат D3: `nodes`/`links`) для конкретного запуска или последнего.

### GET `/api/v1/projects/{project_id}/metrics?run_id=...`
Получить метрики по файлам для конкретного запуска или последнего.

## Структура проекта

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI приложение (подключение роутеров + init БД)
│   ├── config.py               # Конфигурация и настройки (включая SQLite)
│   ├── database/               # SQLAlchemy engine/session/base
│   ├── models/                 # ORM модели (Project, AnalysisRun, FileNode, ...)
│   ├── schemas/                # Pydantic схемы (request/response)
│   ├── repositories/           # Repository pattern (доступ к БД)
│   ├── services/               # Бизнес-логика (analysis_service, graph_service)
│   ├── api/                    # Роутеры FastAPI (projects/analysis/graph/metrics)
│   ├── graph/                  # Парсер/экстрактор/построитель графа
│   └── utils/                  # Утилиты для работы с путями
├── repositories/            # Клонированные репозитории (создается автоматически)
├── temp/                    # Временные файлы (создается автоматически)
├── data/                    # SQLite база (создается автоматически)
├── requirements.txt
└── README.md
```

## Особенности

- Поддержка JavaScript, TypeScript, JSX, TSX файлов
- Автоматическое разрешение относительных и абсолютных импортов
- Вычисление метрик: in-degree, out-degree, centrality
- Асинхронная обработка больших репозиториев
- Готовые данные для визуализации в D3.js

## Примечания

- Данные анализа теперь сохраняются в SQLite (`backend/data/app.db`), чтобы можно было отслеживать эволюцию зависимостей.
- Для больших репозиториев может потребоваться оптимизация парсинга
- CORS настроен для всех источников - в продакшене нужно ограничить

