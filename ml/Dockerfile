# syntax=docker/dockerfile:1
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

ENV ML_MODEL_PATH=/opt/ml/model
COPY src/e5_model.py ./src/e5_model.py
RUN python -c 'import os; from src.e5_model import download_model; download_model(os.environ["ML_MODEL_PATH"])'

COPY src/ ./ml/src/
COPY health/ ./ml/health/

CMD ["python", "-m", "ml.src.main"]
