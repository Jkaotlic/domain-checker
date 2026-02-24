@echo off
chcp 65001 >nul
cls

REM Переход в директорию скрипта (работает при запуске из любого места)
cd /d "%~dp0"

echo 🚀 Запуск Domain Checker...
echo.

REM Проверка Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js не установлен!
    echo Установите Node.js с https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i

echo ✓ Node.js %NODE_VERSION%
echo ✓ npm %NPM_VERSION%
echo.

REM Создание .env из примера, если отсутствует
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo 📄 Создан .env из .env.example (можете отредактировать при необходимости^)
        echo.
    )
)

REM Проверка зависимостей
if not exist "node_modules" (
    echo 📦 Установка зависимостей...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ Ошибка при установке зависимостей
        pause
        exit /b 1
    )
    echo.
)

REM Запуск приложения
if not defined PORT set PORT=3000

echo 🌐 Запуск сервера разработки...
echo 📍 Приложение будет доступно по адресу: http://localhost:%PORT%
echo.
echo Нажмите Ctrl+C для остановки сервера
echo.

call npm run dev -- -p %PORT%
