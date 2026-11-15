# Giga buddy (Кейс Авито)

### Локальный запуск

`make up` запускает основные сервисы Docker Compose.
`make demo` запускает стек с профилем `mcp-demo`, включая `buddy-mcp`.
Если порт 80 занят, добавьте `NGINX_PORT=8081` в `.env` и откройте [http://127.0.0.1:8081](http://127.0.0.1:8081/).
`make down` останавливает стек и сохраняет тома.
`make down-v` останавливает стек и удаляет тома вместе с данными PostgreSQL.

### Тесты Python

Запускайте команды из корня проекта. Для ML и интеграции нужны отдельные окружения Python 3.12, поскольку сервисы используют разные версии OpenAI SDK.

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r ml/requirements-test.txt
.venv/bin/python -m pytest ml/tests --cov=ml/src --cov=ml/health

python3.12 -m venv integration/.venv
integration/.venv/bin/python -m pip install -r integration/requirements-test.txt
integration/.venv/bin/python -m pytest integration/tests --cov=integration/src
```

### Тестовые данные PostgreSQL

Из корня проекта с настроенным `.env` выполните команду, которая запускает PostgreSQL, применяет миграции и загружает данные в локальную БД.

```bash
make seed
```

Для входа используйте `admin` или `intern` с паролем `123`.
Скрипт добавляет историю чата, истёкшие сессии и черновики заявок. Повторный
запуск пропускает существующие записи. Таблицы `documents` и `document_chunks`
скрипт оставляет без изменений.

### Google Drive credentials (secrets folder)

Create a `secrets` directory in the project root and place your Google
service account key file at:

```text
secrets/google_drive_credentials.json
```

Docker Compose mounts the credentials file into the integration container automatically.

Do not commit the credentials file.
