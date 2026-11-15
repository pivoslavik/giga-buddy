# Отчёт о покрытии

| Компонент | Результат | Покрытие строк или операторов | Покрытие ветвей |
| --- | --- | --- | --- |
| Frontend | 203 теста прошли | 99,91% строк (1174 из 1175) | 95,70% (624 из 652) |
| Backend | Набор Go с детектором гонок прошёл | 95,19% операторов (416 из 437) | — |
| ML и MCP | 138 тестов прошли | 94,10% строк (862 из 916) | 89,29% (200 из 224) |
| Интеграция Google Drive | 18 тестов прошли | 100% строк (243 из 243) | 92,86% (26 из 28) |

Тесты backend использовали временную PostgreSQL 18.6. В Compose используется
PostgreSQL 17. Фронтенд проверен с Node.js 22.23.1. В Compose используется
Node.js 24. Go-тесты запускались на Go 1.26.10, Python-тесты на Python 3.12.16.
Первый прогон фронтенда прервался по таймауту теста прокси. Повторный прогон
с четырьмя воркерами прошёл целиком.

## Воспроизведение

Установите зависимости по [README проекта](../README.md#тесты-и-отчёты-о-покрытии).
Из корня репозитория выполните команды:

```bash
npm --prefix frontend run coverage -- --maxWorkers=4
# TEST_DATABASE_URL должен указывать на отдельную тестовую БД
bash backend/tests/run.sh
.venv/bin/python -m pytest ml/tests --cov=ml/src --cov=ml/health --cov-report=html:ml/htmlcov --cov-report=json:ml/htmlcov/coverage.json
integration/.venv/bin/python -m pytest integration/tests --cov=integration/src --cov-report=html:integration/htmlcov --cov-report=json:integration/htmlcov/coverage.json
```

Фронтенд сохраняет HTML и LCOV в `frontend/coverage/`. Backend сохраняет
HTML, профиль и текстовое резюме в `backend/coverage/`. Отчёты Python
находятся в `ml/htmlcov/` и `integration/htmlcov/`.
