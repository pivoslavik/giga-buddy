FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./ml/src/
COPY health/ ./ml/health/

CMD ["python", "-m", "ml.src.main"]
