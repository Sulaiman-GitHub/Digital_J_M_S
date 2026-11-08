# Backend image. Build from the repository root:
#   docker build -f deploy/backend.Dockerfile -t djms-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY backend/ /app/backend/
COPY scripts/ /app/scripts/

RUN useradd --system --create-home --uid 10001 djms \
    && mkdir -p /data/storage \
    && chown -R djms:djms /data
USER djms

EXPOSE 8000

# Behind Caddy only: trust its forwarded headers so rate limits see the real client address.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=*"]
