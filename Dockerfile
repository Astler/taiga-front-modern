# syntax=docker/dockerfile:1.7

FROM node:24.19.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=taiga-front-modern-npm,target=/root/.npm,sharing=locked \
    set -eu; \
    attempt=1; \
    last_status=1; \
    while [ "$attempt" -le 3 ]; do \
      echo "npm ci attempt ${attempt}/3 (12-minute cap)"; \
      if timeout -k 15 720 npm ci \
          --prefer-offline \
          --no-audit \
          --no-fund \
          --maxsockets=2 \
          --fetch-retries=2 \
          --fetch-retry-factor=2 \
          --fetch-retry-mintimeout=10000 \
          --fetch-retry-maxtimeout=60000 \
          --fetch-timeout=300000; then \
        exit 0; \
      else \
        last_status=$?; \
      fi; \
      if [ "$attempt" -lt 3 ]; then \
        echo "npm ci attempt $attempt failed; retrying from the package cache..." >&2; \
        sleep $((attempt * 10)); \
      fi; \
      attempt=$((attempt + 1)); \
    done; \
    echo "npm ci failed after 3 bounded attempts" >&2; \
    exit "$last_status"

COPY . .
RUN npm run build

FROM nginx:1.29-alpine

LABEL org.opencontainers.image.source="https://github.com/Astler/taiga-front-modern"
LABEL org.opencontainers.image.description="Modern PressF frontend for Taiga"

COPY --from=build /app/dist/taiga-front-modern/browser/ /usr/share/nginx/html/
COPY docker/default.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/config.template.json /usr/share/nginx/html/config.template.json
COPY docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/index.html && \
        wget --quiet --tries=1 --spider http://127.0.0.1/config.json || exit 1

