# Code Dependency Analyzer Backend

Бэкенд-сервис для анализа зависимостей в JavaScript/TypeScript проектах. Позволяет загружать репозитории из GitHub и визуализировать связи между файлами через графы.

## Архитектура

Проект использует FastAPI и состоит из следующих компонентов:

- **Repository Loader** - клонирование репозиториев из GitHub
- **File Scanner** - поиск и сканирование JS/TS файлов
- **Parser** - парсинг импортов и зависимостей
- **Graph Builder** - построение графов зависимостей с использованием NetworkX

## Установка

1. Убедитесь, что у вас установлен Python 3.8+

2. Создайте виртуальное окружение:
```bash
python -m venv venv
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
python -m app.main
```

API будет доступен по адресу: `http://localhost:8000`

Документация API (Swagger): `http://localhost:8000/docs`

## API Endpoints

### POST `/api/v1/analyze`
Запускает анализ репозитория.

**Request:**
```json
{
  "repo_url": "https://github.com/user/repo.git"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "status": "processing",
  "repository": {
    "url": "https://github.com/user/repo.git",
    "name": "repo",
    "analyzed_at": null
  },
  "files": [],
  "graph_data": {
    "nodes": [],
    "links": []
  }
}
```

### GET `/api/v1/session/{session_id}`
Получает статус сессии анализа.

### GET `/api/v1/session/{session_id}/result`
Получает результат анализа с графом данных для D3.js.

**Response:**
```json
{
  "session_id": "uuid",
  "status": "completed",
  "repository": {...},
  "files": [
    {
      "file_path": "src/components/Button.tsx",
      "file_type": "tsx",
      "sloc": 150,
      "dependencies": [...],
      "metrics": {
        "in_degree": 5,
        "out_degree": 3,
        "centrality": 0.15
      }
    }
  ],
  "graph_data": {
    "nodes": [...],
    "links": [...]
  },
  "statistics": {
    "total_files": 50,
    "total_dependencies": 120,
    "average_in_degree": 2.4,
    "average_out_degree": 2.4
  }
}
```

## Структура проекта

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI приложение и роуты
│   ├── config.py            # Конфигурация и настройки
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py       # Pydantic схемы
│   ├── services/
│   │   ├── __init__.py
│   │   ├── repo_loader.py   # Клонирование репозиториев
│   │   ├── file_scanner.py  # Сканирование файлов
│   │   ├── parser.py        # Парсинг импортов
│   │   └── graph.py         # Построение графов
│   └── utils/
│       ├── __init__.py
│       └── paths.py         # Утилиты для работы с путями
├── repositories/            # Клонированные репозитории (создается автоматически)
├── temp/                    # Временные файлы (создается автоматически)
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

- В текущей реализации сессии хранятся в памяти. Для продакшена рекомендуется использовать базу данных (PostgreSQL, MongoDB)
- Для больших репозиториев может потребоваться оптимизация парсинга
- CORS настроен для всех источников - в продакшене нужно ограничить

