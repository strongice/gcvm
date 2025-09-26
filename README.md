# GCVM — GitLab CI/CD Variables Manager

_Russian:_ [jump to the Russian version](#ru)

---

<a id="en"></a>
## 🇬🇧 Overview

**GCVM** is a FastAPI web app to view and edit GitLab CI/CD variables (types **env_var** and **file**) at both **project** and **group** scopes. It lets you search, create, update, and delete variables safely.

### Requirements

- Reachable GitLab CE/EE (self-hosted)
- Personal Access Token with **api** scope
- Docker + Docker Compose

### Environment Variables

> ⚠️ **Important:** `GITLAB_BASE_URL` **must** end with `/api/v4`.

Sample `.env`:

```env
# GitLab API base URL — must end with /api/v4
GITLAB_BASE_URL=https://gitlab.example.com/api/v4

# Personal Access Token (scope: api)
GITLAB_TOKEN=glpat-XXXXXXXXXXXXXXXXXXXXXXXX

# App log level: DEBUG / INFO / WARNING / ERROR
LOG_LEVEL=INFO
GITLAB_LOG_LEVEL=WARNING
```

### Run with Docker Compose

`docker-compose.yml`:

```yaml
services:
  web:
    image: strongice/gcvm:v0.1.0
    container_name: gcvm
    env_file:
      - .env
    ports:
      - "80:8080"
    networks:
      - gcvm

networks:
  gcvm:
    name: gcvm
```

Start:

```bash
docker compose up -d
```

Then open: `http://localhost/`

---

<a id="ru"></a>
## 🇷🇺 Описание

_English:_ [jump to the English version](#en)

**GCVM** — это веб-приложение на FastAPI для просмотра и редактирования CI/CD-переменных GitLab: искать, просматривать, создавать, обновлять значения как в **проектах**, так и в **группах**. Поддерживаются оба типа переменных — обычные переменные окружения и переменные-файлы.

### Требования

- Доступный GitLab CE/EE (self-hosted)
- Персональный токен с областью **api**
- Docker + Docker Compose

### Переменные окружения

> ⚠️ **Важно:** в `GITLAB_BASE_URL` обязательно укажите суффикс `/api/v4`.

Пример `.env`:

```env
# Базовый URL GitLab API — обязательно заканчивается на /api/v4
GITLAB_BASE_URL=https://gitlab.example.com/api/v4

# Персональный токен (область: api)
GITLAB_TOKEN=glpat-XXXXXXXXXXXXXXXXXXXXXXXX

# Логи приложения: DEBUG / INFO / WARNING / ERROR
LOG_LEVEL=INFO
GITLAB_LOG_LEVEL=WARNING
```

### Запуск через Docker Compose

`docker-compose.yml`:

```yaml
services:
  web:
    image: strongice/gcvm:v0.1.0
    container_name: gcvm
    env_file:
      - .env
    ports:
      - "80:8080"
    networks:
      - gcvm

networks:
  gcvm:
    name: gcvm
```

Запуск:

```bash
docker compose up -d
```

После запуска откройте: `http://localhost/`