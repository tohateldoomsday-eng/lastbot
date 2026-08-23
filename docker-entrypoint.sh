#!/bin/sh
set -e

# Данные админ-панели (контент сайта + секрет сессии) живут в volume /app/data
mkdir -p /app/data
chown -R nginx:nginx /app/data

# Админ-бэкенд: API /api/* и панель /admin
DATA_DIR=/app/data node /app/server/admin-server.mjs &

# Nginx на переднем плане
exec nginx -g "daemon off;"
