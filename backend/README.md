# Backend

Go API на Gin. Обслуживает вход и сессии, профиль, базу знаний и чат.
В Compose слушает порт 8080 внутри сети. Браузер обращается через nginx по `/api`.

Из корня проекта, с настроенным [`.env`](../.env.example):

```bash
docker compose up -d --build backend ml buddy-mcp
docker compose logs -f backend
```

PostgreSQL и миграции запускаются по зависимостям Compose. Backend использует
`DATABASE_URL`, `JWT_SECRET`, `MESSAGES_PER_USER` и `ML_URL`.

| Маршрут | Назначение |
| --- | --- |
| `GET /health` | Проверка процесса для Compose |
| `POST /api/auth/login` | Проверка пароля и выдача cookies |
| `POST /api/auth/refresh` | Обновление access-токена по refresh-cookie |
| `POST /api/auth/logout` | Удаление refresh-сессии и cookies |
| `GET /api/user` | Профиль текущего пользователя |
| `GET /api/documents` | Список по `amount` и одному или нескольким `category` |
| `GET /api/documents/:id` | Содержимое документа |
| `GET /api/chat` | История сообщений пользователя |
| `POST /api/chat` | Принимает JSON с полем `message` и отдаёт SSE |

В чате backend сохраняет вопрос, вызывает [ML](../ml/README.md) с ID пользователя
и сообщения, передаёт события браузеру и сохраняет полный ответ после `done`.
Профиль, документы и чат требуют access-cookie.

Для тестов нужна отдельная БД. Инструкция и команда запуска в
[README тестов](tests/README.md).
