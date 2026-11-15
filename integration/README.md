# Интеграция Google Drive

Фоновый сервис опрашивает папку Google Drive с паузой 30 секунд между проходами.
Он сравнивает ID и время изменения файлов с таблицей `documents`. Новые и
изменённые файлы скачивает во временные подпапки `documents/`, читает как текст
и передаёт модели для получения названия, описания и категории. Затем сохраняет
документ в PostgreSQL и уведомляет [ML](../ml/README.md) через `POST /documents`,
чтобы обновить индекс. Документы, исчезнувшие из папки, удаляются из базы.

Для запуска из корня проекта укажи `FOLDER_ID` и настройки `OPENAI_*` в
[`.env`](../.env.example). Предоставь сервисному аккаунту доступ на чтение папки
и положи JSON-ключ в `secrets/google_drive_credentials.json`. Compose монтирует
его только для чтения и передаёт `GOOGLE_DRIVE_CREDENTIALS`, `DB_URL` и `ML_URL`.
Ключ хранится локально вне Git.

```bash
docker compose up -d --build ml integration
docker compose logs -f integration
```

Успешная синхронизация видна в логах как `Synced N documents`. Если процесс
повторяет уведомление ML, проверь `ML_URL`, состояние ML и его логи.

## Тесты

Из корня проекта. Для интеграции используется отдельное окружение с её
версией OpenAI SDK.

```bash
python3.12 -m venv integration/.venv
integration/.venv/bin/python -m pip install -r integration/requirements-test.txt
integration/.venv/bin/python -m pytest integration/tests --cov=integration/src
```
