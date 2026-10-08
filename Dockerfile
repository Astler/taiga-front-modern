# syntax=docker/dockerfile:1.7

FROM node:24.19.0-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=taiga-front-modern-npm,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund

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

