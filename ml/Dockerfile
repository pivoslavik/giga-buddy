# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

ENV ML_MODEL_PATH=/opt/ml/model
COPY src/e5_model.py ./src/e5_model.py
RUN python -c 'import os; from src.e5_model import download_model; download_model(os.environ["ML_MODEL_PATH"])'

COPY src/ ./src/

CMD ["python", "-m", "src.main"]
