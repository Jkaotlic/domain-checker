#!/bin/bash

echo "🚀 Запуск Domain Checker..."
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен!"
    echo "Установите Node.js с https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node -v)"
echo "✓ npm $(npm -v)"
echo ""

# Проверка зависимостей
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Ошибка при установке зависимостей"
        exit 1
    fi
    echo ""
fi

# Запуск приложения
echo "🌐 Запуск сервера разработки..."
echo "📍 Приложение будет доступно по адресу: http://localhost:3000"
echo ""
echo "Нажмите Ctrl+C для остановки сервера"
echo ""

npm run dev
