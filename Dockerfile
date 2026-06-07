# Multi-stage build for optimized image

# Stage 1: Frontend build
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Using npm install (not npm ci) because lockfile version mismatches between
# local npm and the container's npm cause ci to reject platform-specific optional
# deps (esbuild). install --include=optional ensures all platform binaries are resolved.
RUN npm install --include=optional
COPY frontend/ .
RUN npm run build

# Stage 2: Python dependencies
FROM python:3.14-slim AS python-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 3: Production image
FROM python:3.14-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=5000

COPY --from=python-builder /install /usr/local

COPY app.py config.py extensions.py models.py schemas.py requirements.txt ./
COPY start.sh ./
COPY routes ./routes
COPY utils ./utils
COPY jobs ./jobs
COPY migrations ./migrations
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN sed -i 's/\r$//' /app/start.sh && \
    chmod +x /app/start.sh && \
    adduser --disabled-password --gecos '' --uid 10001 appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"5000\")}/health')"

CMD ["./start.sh"]
