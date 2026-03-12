# Code Dependency Analyzer Frontend

Фронтенд-приложение для анализа зависимостей в JavaScript/TypeScript проектах.

## Технологии

- React 18
- TypeScript
- Vite
- CSS (inline styles для простоты)

## Установка

1. Установите зависимости:
```bash
npm install
```

## Запуск

1. Убедитесь, что бэкенд запущен на `http://localhost:8000`

2. Запустите фронтенд:
```bash
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:3000`

## Использование

1. Введите URL репозитория GitHub в поле ввода (например: `https://github.com/user/repo.git`)
2. Нажмите кнопку "Анализировать"
3. Дождитесь завершения анализа (статус обновляется автоматически)
4. Просмотрите результаты анализа

## Структура проекта

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts          # API клиент для работы с бэкендом
│   ├── components/
│   │   ├── AnalyzeForm.tsx     # Форма для ввода URL репозитория
│   │   ├── SessionStatus.tsx   # Компонент отображения статуса анализа
│   │   └── AnalysisResult.tsx  # Компонент отображения результатов
│   ├── types/
│   │   └── api.ts              # TypeScript типы для API
│   ├── App.tsx                 # Главный компонент приложения
│   ├── main.tsx                # Точка входа
│   └── index.css               # Глобальные стили
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## API Endpoints

Фронтенд использует следующие эндпоинты бэкенда:

- `GET /api/v1/health` - проверка здоровья сервиса
- `POST /api/v1/analyze` - запуск анализа репозитория
- `GET /api/v1/session/{session_id}` - получение статуса сессии
- `GET /api/v1/session/{session_id}/result` - получение результата анализа



