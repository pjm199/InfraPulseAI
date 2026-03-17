# InfraPulse Python AI Backend (Phase 3)
FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir -U pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY .env* ./

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
