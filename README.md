# GCVM — GitLab CI/CD Variables Manager

**Russian:** [jump to the Russian version](#ru)

---

<a id="en"></a>
## 🇬🇧 Overview

**GCVM** is a FastAPI web app to view and edit GitLab CI/CD variables (types **env_var** and **file**) at both **project** and **group** scopes. It auto-detects the browser language (RU/EN) and lets you search, create, update, and delete variables safely.

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

# Personal Access Token (scope: api\repo)
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

English: [jump to the English version](#en)

**GCVM** — это веб-приложение на FastAPI для просмотра и редактирования CI/CD-переменных GitLab: искать, просматривать, создавать, обновлять значения как в **проектах**, так и в **группах**. Интерфейс автоматически подстраивается под RU/EN язык и поддерживает оба типа переменных — обычные переменные окружения и переменные-файлы.

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

# Персональный токен (область: api\repo)
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

---

### Changelog (latest)
- Unified the overall visual style of the app: consistent typography, rounded surfaces, gradients, and shadows.
- Refreshed the settings modal with a custom language dropdown that matches the app styling.
- Anchored environment and type pickers so dropdown menus open neatly under their controls.
- Added a dedicated delete action in the variables table for quicker cleanup.
- Trimmed sidebar breadcrumbs with smart ellipsis and made modals close when clicking outside.

### Изменения (последнее)
- Привели визуальный стиль всего интерфейса к единому виду: типографика, скругления, градиенты и тени.
- Обновили окно настроек: кастомный переключатель языка теперь оформлен в едином стиле приложения.
- Зафиксировали раскрывающиеся списки окружений и типов переменных под контролами, без смещений.
- Добавили отдельную кнопку удаления переменных для быстрого наведения порядка.
- Сократили цепочку хлебных крошек через сокращение с многоточием и сделали модалки закрываемыми по клику вне окна.
