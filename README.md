# Giga buddy (Кейс Авито)

## Загрузка документов

После запуска через Docker Compose отправьте JSON на `POST /documents`
с заголовком `Content-Type: application/json`.

```json
{
  "title": "Первый день",
  "description": "Памятка для новых сотрудников",
  "text": "Познакомьтесь с наставником. Затем запросите доступ к рабочим сервисам.",
  "category": "start_work"
}
```

Допустимые категории: `start_work`, `development`, `work_processes`,
`team_values`, `contacts`, `ai_answers`, `company`.

При успехе API возвращает `201 Created` с идентификатором документа и числом
сохранённых чанков, например `{"id": 1, "chunk_count": 1}`.
ML-сервис загружает модель `intfloat/multilingual-e5-small` при запуске.
