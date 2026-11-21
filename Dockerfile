# ── STAGE 1: Build React Frontend ────────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
COPY shared/ ../shared/
RUN npm run build

# ── STAGE 2: Final Runtime Image ─────────────────────────────────────────────
FROM python:3.10-slim

# Install Node.js, nginx, supervisor
RUN apt-get update && apt-get install -y \
    curl nginx supervisor \
    libsndfile1 ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Backend ───────────────────────────────────────────────────────────────────
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend/ ./backend/

# ── Shared schema ─────────────────────────────────────────────────────────────
COPY shared/ ./shared/

# ── Python AI Service ─────────────────────────────────────────────────────────
COPY services/ai/requirements.txt ./services/ai/
RUN pip install --no-cache-dir -r services/ai/requirements.txt
COPY services/ai/ ./services/ai/

# ── Frontend (built static files) ────────────────────────────────────────────
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# ── nginx config ──────────────────────────────────────────────────────────────
COPY deploy/nginx.conf /etc/nginx/nginx.conf

# ── Supervisor config ─────────────────────────────────────────────────────────
COPY deploy/supervisord.conf /etc/supervisor/conf.d/samvaad.conf

# Create data dir for SQLite
RUN mkdir -p /data/samvaad

# HuggingFace Spaces requires port 7860
EXPOSE 7860

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/samvaad.conf"]
