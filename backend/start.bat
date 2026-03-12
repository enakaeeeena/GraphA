@echo off
echo Активация виртуального окружения...
call venv\Scripts\activate.bat

echo Запуск бэкенда на http://localhost:8000
echo Документация API: http://localhost:8000/docs
echo.

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause

