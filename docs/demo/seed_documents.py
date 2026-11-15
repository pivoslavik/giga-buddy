"""Load synthetic knowledge-base fixtures from inside the ML container."""

import asyncio
import os

import asyncpg
import httpx

DOCUMENTS = (
    (
        "structure",
        "Структура демо-команды",
        "Как устроены юниты и кластеры в учебном примере.",
        "company",
        "Юнит — кросс-функциональная команда. В ней могут работать инженеры, "
        "тестировщики, аналитики, дизайнеры и менеджеры продукта. Кластер объединяет "
        "юниты с близкими задачами. Продуктовые юниты развивают функции для пользователей, "
        "а платформенные помогают другим командам общими инструментами.",
    ),
    (
        "processes",
        "Процессы и стандарты демо-команды",
        "Scrum, ревью и Developer Experience в учебном примере.",
        "work_processes",
        "На планировании команда выбирает цель спринта, на обзоре показывает результат, "
        "а на ретроспективе обсуждает улучшения. Перед запросом ревью стажёр проверяет CI "
        "и описывает изменения. Developer Experience (DX) — подход к улучшению инструментов "
        "и процессов для разработчиков.",
    ),
    (
        "goals",
        "Целеполагание по OKR",
        "Учебный пример цели и измеримого ключевого результата.",
        "start_work",
        "OKR расшифровывается как Objectives and Key Results. Objective описывает желаемое "
        "изменение, а Key Result задаёт измеримый результат. Пример цели учебной команды — "
        "ускорить первый запуск проекта. Ключевой результат — сократить время запуска "
        "с 30 до 15 минут. Стажёр уточняет у наставника, как его задача помогает цели юнита.",
    ),
)


async def main():
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        async with connection.transaction():
            document_ids = [
                await connection.fetchval(
                    """
                    INSERT INTO documents (
                        google_document_id, title, description,
                        category, text, source_modified_at
                    )
                    VALUES ($1, $2, $3, $4, $5, now())
                    ON CONFLICT (google_document_id) DO UPDATE SET
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        category = EXCLUDED.category,
                        text = EXCLUDED.text,
                        source_modified_at = EXCLUDED.source_modified_at
                    RETURNING id
                    """,
                    f"demo:{key}",
                    title,
                    description,
                    category,
                    f"# {title}\n\nЭто синтетический материал для демо.\n\n{body}",
                )
                for key, title, description, category, body in DOCUMENTS
            ]
    finally:
        await connection.close()

    async with httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", timeout=60
    ) as client:
        for document_id in document_ids:
            response = await client.post(
                "/documents", json={"document_id": document_id, "status": "modified"}
            )
            response.raise_for_status()

    print(f"Indexed {len(document_ids)} demo documents")


if __name__ == "__main__":
    asyncio.run(main())
