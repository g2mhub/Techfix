# TechFix OS — backend Flask + UI estática
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0

WORKDIR /app

# Dependências primeiro (aproveita cache de camadas do Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Aplicação: backend + frontend (a UI é servida pelo próprio Flask)
COPY server ./server
COPY index.html ./index.html
COPY css ./css
COPY js ./js

# Banco SQLite (opcional — no docker-compose usamos Postgres via DATABASE_URL)
RUN mkdir -p /app/data

EXPOSE 8432

# O app lê DATABASE_URL (Postgres) ou cai no SQLite; PORT pode vir do ambiente.
CMD ["python", "-m", "server.app"]
