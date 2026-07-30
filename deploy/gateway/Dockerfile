# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS frontend-build

ARG VITE_API_BASE_URL=/
ARG VITE_COPILOT_RUNTIME_URL=/api/copilotkit
ARG VITE_OFFLINE_MODE=true
ARG VITE_ALLOW_PUBLIC_REGISTRATION=1

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_COPILOT_RUNTIME_URL=${VITE_COPILOT_RUNTIME_URL} \
    VITE_OFFLINE_MODE=${VITE_OFFLINE_MODE} \
    VITE_ALLOW_PUBLIC_REGISTRATION=${VITE_ALLOW_PUBLIC_REGISTRATION}

WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# 1.31.3 is the first mainline release outside the 2026 NGINX advisory ranges.
FROM nginx:1.31.3-alpine3.24 AS runtime

COPY deploy/gateway/nginx.conf /etc/nginx/nginx.conf
COPY deploy/model-proxy/nginx.conf /etc/nginx/model-proxy.conf
COPY --from=frontend-build /src/frontend/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
