FROM node:20-alpine AS fe
WORKDIR /fe

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt 

COPY app ./app
COPY app.py ./
COPY --from=fe /fe/dist ./frontend/dist

CMD ["python", "app.py"]
