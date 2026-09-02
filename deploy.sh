#!/bin/sh
# ============================================================
# Деплой LASTBOT на VPS.
# Запускать НА СЕРВЕРЕ из корня проекта:  ./deploy.sh
# Что делает: git pull -> бэкап data/ -> сборка -> перезапуск -> проверки
# ============================================================
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Ошибка: docker не установлен на этом сервере" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "Ошибка: нет файла .env. Создайте его из .env.example и задайте свой ADMIN_PASS." >&2
  exit 1
fi

# Совместимость: docker compose (v2, плагин) или docker-compose (v1)
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "Ошибка: не найден ни 'docker compose', ни 'docker-compose'." >&2
  exit 1
fi

echo "==> Обновляем код (git pull)..."
git pull --ff-only

if [ -d data ]; then
  BAK="data.bak.$(date +%Y%m%d-%H%M%S)"
  echo "==> Резервная копия данных админки -> $BAK"
  cp -r data "$BAK"
fi

echo "==> Сборка образа..."
$DC build

echo "==> Перезапуск контейнера..."
$DC up -d

sleep 2
echo "==> Статус:"
$DC ps

echo "==> Проверки:"
if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then
  echo "  healthz: ok"
else
  echo "  healthz: НЕ ОТВЕЧАЕТ — смотрите: $DC logs web"
fi
if curl -fsS "http://localhost:8080/api/news?lang=ru" >/dev/null 2>&1; then
  echo "  /api/news: ok"
else
  echo "  /api/news: НЕ ОТВЕЧАЕТ"
fi

echo "==> Готово."
echo "    Напоминание: если меняли файлы в public/ — поднимите ?v= в index.html (см. README)."
