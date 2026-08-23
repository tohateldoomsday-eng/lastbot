# ============================================================
# LASTBOT — production-образ: Nginx + админ-бэкенд
# ============================================================
FROM nginx:alpine

# Node.js для админ-бэкенда (пакет официального alpine-репозитория,
# отдельный образ не используется)
RUN apk add --no-cache nodejs

# Кастомная конфигурация (заменяет стандартный default.conf)
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Файлы сайта; владелец nginx — процесс может только читать
COPY --chown=nginx:nginx public/ /usr/share/nginx/html/

# Админ-бэкенд (API + панель /admin)
COPY server/ /app/server/
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Порт, который слушает Nginx
EXPOSE 80

# Проверка живости контейнера (wget уже есть в busybox образа)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
