# syntax=docker/dockerfile:1
# Unified multi-stage container running all 6 projects + Nginx gateway on one Cloud Run instance.

# ==============================================================================
# Stage 1: Build all 5 Node.js frontends (2 Next.js standalone + 3 Vite SPAs)
# ==============================================================================
FROM node:20-bookworm-slim AS node-builder

WORKDIR /src

# 1. AI-operations-Diagonostic (Next.js)
COPY AI-operations-Diagonostic/web/package*.json ./AI-operations-Diagonostic/web/
RUN cd AI-operations-Diagonostic/web && (npm ci || npm install)
COPY AI-operations-Diagonostic/web ./AI-operations-Diagonostic/web
RUN cd AI-operations-Diagonostic/web \
    && NEXT_PUBLIC_BASE_PATH=/AI-operations-Diagonostic \
       NEXT_PUBLIC_API_URL=/AI-operations-Diagonostic/api \
       NEXT_PUBLIC_DEMO_TOKEN=local-demo-token-change-me \
       npm run build

# 2. Procurement-Quote-Comparison-Agent (Next.js)
COPY Procurement-Quote-Comparison-Agent/apps/web/package*.json ./Procurement-Quote-Comparison-Agent/apps/web/
RUN cd Procurement-Quote-Comparison-Agent/apps/web && (npm ci || npm install)
COPY Procurement-Quote-Comparison-Agent/apps/web ./Procurement-Quote-Comparison-Agent/apps/web
RUN cd Procurement-Quote-Comparison-Agent/apps/web \
    && NEXT_PUBLIC_BASE_PATH=/Procurement-Quote-Comparison-Agent \
       NEXT_PUBLIC_API_URL=/Procurement-Quote-Comparison-Agent/api \
       npm run build

# 3. Construction-variation-tracker (Vite React)
COPY Construction-variation-tracker/frontend/package*.json ./Construction-variation-tracker/frontend/
RUN cd Construction-variation-tracker/frontend && (npm ci || npm install)
COPY Construction-variation-tracker/frontend ./Construction-variation-tracker/frontend
RUN cd Construction-variation-tracker/frontend \
    && VITE_BASE_PATH=/Construction-variation-tracker/ \
       VITE_API_BASE_URL=/Construction-variation-tracker/api \
       npm run build

# 4. Contract-Invoice-Leakage-Finder (Vite React)
COPY Contract-Invoice-Leakage-Finder/frontend/package*.json ./Contract-Invoice-Leakage-Finder/frontend/
RUN cd Contract-Invoice-Leakage-Finder/frontend && (npm ci || npm install)
COPY Contract-Invoice-Leakage-Finder/frontend ./Contract-Invoice-Leakage-Finder/frontend
RUN cd Contract-Invoice-Leakage-Finder/frontend \
    && VITE_BASE_PATH=/Contract-Invoice-Leakage-Finder/ \
       VITE_API_URL=/Contract-Invoice-Leakage-Finder/api \
       npm run build

# 5. Industry-Specific-Lead-to-Order-Agent (Vite React)
COPY Industry-Specific-Lead-to-Order-Agent/frontend/package*.json ./Industry-Specific-Lead-to-Order-Agent/frontend/
RUN cd Industry-Specific-Lead-to-Order-Agent/frontend && (npm ci || npm install)
COPY Industry-Specific-Lead-to-Order-Agent/frontend ./Industry-Specific-Lead-to-Order-Agent/frontend
RUN cd Industry-Specific-Lead-to-Order-Agent/frontend \
    && VITE_BASE_PATH=/Industry-Specific-Lead-to-Order-Agent/ \
       VITE_API_URL=/Industry-Specific-Lead-to-Order-Agent/api/v1 \
       npm run build


# ==============================================================================
# Stage 2: Build isolated Python virtual environments for all 6 backends
# ==============================================================================
FROM python:3.12-slim AS python-builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 1. Agent_Assurence
COPY Agent_Assurence/requirements.txt /tmp/reqs/agent-assurence.txt
RUN python -m venv /opt/venvs/agent-assurence \
    && /opt/venvs/agent-assurence/bin/pip install --upgrade pip \
    && /opt/venvs/agent-assurence/bin/pip install -r /tmp/reqs/agent-assurence.txt

# 2. AI-operations-Diagonostic
COPY AI-operations-Diagonostic/api/requirements.txt /tmp/reqs/ai-ops.txt
RUN python -m venv /opt/venvs/ai-ops \
    && /opt/venvs/ai-ops/bin/pip install --upgrade pip \
    && /opt/venvs/ai-ops/bin/pip install -r /tmp/reqs/ai-ops.txt

# 3. Construction-variation-tracker (pyproject.toml)
COPY Construction-variation-tracker/backend /tmp/cvt-backend
RUN python -m venv /opt/venvs/construction \
    && /opt/venvs/construction/bin/pip install --upgrade pip \
    && /opt/venvs/construction/bin/pip install /tmp/cvt-backend

# 4. Contract-Invoice-Leakage-Finder
COPY Contract-Invoice-Leakage-Finder/backend/requirements.txt /tmp/reqs/leakage.txt
RUN python -m venv /opt/venvs/leakage \
    && /opt/venvs/leakage/bin/pip install --upgrade pip \
    && /opt/venvs/leakage/bin/pip install -r /tmp/reqs/leakage.txt

# 5. Industry-Specific-Lead-to-Order-Agent
COPY Industry-Specific-Lead-to-Order-Agent/backend/requirements.txt /tmp/reqs/lead-to-order.txt
RUN python -m venv /opt/venvs/lead-to-order \
    && /opt/venvs/lead-to-order/bin/pip install --upgrade pip \
    && /opt/venvs/lead-to-order/bin/pip install -r /tmp/reqs/lead-to-order.txt

# 6. Procurement-Quote-Comparison-Agent
COPY Procurement-Quote-Comparison-Agent/services/api/requirements.txt /tmp/reqs/procureai.txt
RUN python -m venv /opt/venvs/procureai \
    && /opt/venvs/procureai/bin/pip install --upgrade pip \
    && /opt/venvs/procureai/bin/pip install -r /tmp/reqs/procureai.txt


# ==============================================================================
# Stage 3: Unified Runtime Image (Nginx + 6 Python Backends + 2 Next.js + Static SPAs)
# ==============================================================================
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    tesseract-ocr \
    curl \
    ca-certificates \
    libstdc++6 \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy Node 20 runtime binary (glibc-matched Debian bookworm) and verify execution
COPY --from=node-builder /usr/local/bin/node /usr/local/bin/node
RUN node --version

# Copy isolated Python virtualenvs
COPY --from=python-builder /opt/venvs /opt/venvs

WORKDIR /app

# Copy Gateway & Portal
COPY gateway /app/gateway

# 1. Agent_Assurence (FastAPI + static frontend)
COPY Agent_Assurence/backend /app/Agent_Assurence/backend
COPY Agent_Assurence/frontend /app/Agent_Assurence/frontend

# 2. AI-operations-Diagonostic (FastAPI + fixtures + Next.js standalone)
COPY AI-operations-Diagonostic/api /app/AI-operations-Diagonostic/api
COPY AI-operations-Diagonostic/fixtures /app/AI-operations-Diagonostic/fixtures
COPY --from=node-builder /src/AI-operations-Diagonostic/web/.next/standalone /app/AI-operations-Diagonostic/web-standalone
COPY --from=node-builder /src/AI-operations-Diagonostic/web/.next/static /app/AI-operations-Diagonostic/web-standalone/.next/static
COPY --from=node-builder /src/AI-operations-Diagonostic/web/public /app/AI-operations-Diagonostic/web-standalone/public

# 3. Construction-variation-tracker (FastAPI + static Vite dist)
COPY Construction-variation-tracker/backend /app/Construction-variation-tracker/backend
COPY --from=node-builder /src/Construction-variation-tracker/frontend/dist /usr/share/nginx/static/Construction-variation-tracker

# 4. Contract-Invoice-Leakage-Finder (FastAPI + sample_data + static Vite dist)
COPY Contract-Invoice-Leakage-Finder/backend /app/Contract-Invoice-Leakage-Finder/backend
COPY Contract-Invoice-Leakage-Finder/sample_data /app/Contract-Invoice-Leakage-Finder/sample_data
COPY --from=node-builder /src/Contract-Invoice-Leakage-Finder/frontend/dist /usr/share/nginx/static/Contract-Invoice-Leakage-Finder

# 5. Industry-Specific-Lead-to-Order-Agent (FastAPI + static Vite dist)
COPY Industry-Specific-Lead-to-Order-Agent/backend /app/Industry-Specific-Lead-to-Order-Agent/backend
COPY --from=node-builder /src/Industry-Specific-Lead-to-Order-Agent/frontend/dist /usr/share/nginx/static/Industry-Specific-Lead-to-Order-Agent

# 6. Procurement-Quote-Comparison-Agent (FastAPI + Next.js standalone)
COPY Procurement-Quote-Comparison-Agent/services /app/Procurement-Quote-Comparison-Agent/services
COPY --from=node-builder /src/Procurement-Quote-Comparison-Agent/apps/web/.next/standalone /app/Procurement-Quote-Comparison-Agent/web-standalone
COPY --from=node-builder /src/Procurement-Quote-Comparison-Agent/apps/web/.next/static /app/Procurement-Quote-Comparison-Agent/web-standalone/.next/static

RUN mkdir -p /app/data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

CMD ["python3", "/app/gateway/start_cloudrun.py"]
