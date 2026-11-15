"""Evaluate document hits using the running ML image and PostgreSQL index."""

import asyncio
import os

import asyncpg
from pgvector.asyncpg import register_vector

from ml.src.chat.store import ChatStore
from ml.src.documents.embeddings import Embeddings, load_model

QUESTIONS = {
    "first-steps": (
        "Что стоит выяснить у наставника в первый рабочий день?",
        "Где узнать, какие репозитории нужны для первой задачи?",
        "Что делать, если я не вижу нужный раздел базы знаний?",
        "Что проверить перед тем, как отправить первое изменение на ревью?",
    ),
    "structure": (
        "Чем кластер отличается от юнита?",
        "Кто входит в кросс-функциональную команду?",
        "Для кого работают платформенные юниты?",
        "Какие команды развивают функции для конечных пользователей?",
    ),
    "processes": (
        "На какой встрече команда обсуждает, как улучшить процесс?",
        "Когда команда показывает результат спринта?",
        "Что означает DX для разработчика?",
        "На какой встрече выбирают цель спринта?",
    ),
    "goals": (
        "Чем Objective отличается от Key Result?",
        "Как расшифровывается OKR?",
        "Приведи пример измеримого результата для ускорения запуска проекта.",
        "Как связать свою первую задачу с целью юнита?",
    ),
}


async def main():
    cases = [
        (f"demo:{key}", q) for key, questions in QUESTIONS.items() for q in questions
    ]
    embeddings = Embeddings([load_model(os.environ["ML_MODEL_PATH"])])
    try:
        vectors = await embeddings.encode(
            [question for _, question in cases], prefix="query"
        )
        async with asyncpg.create_pool(
            os.environ["DATABASE_URL"], min_size=1, max_size=1, init=register_vector
        ) as pool:
            rows = await pool.fetch("""
                SELECT document_chunks.id, documents.google_document_id
                FROM document_chunks JOIN documents
                  ON documents.id = document_chunks.document_id
                """)
            owners = {row["id"]: row["google_document_id"] for row in rows}
            missing = {key for key, _ in cases} - set(owners.values())
            if missing:
                raise SystemExit(
                    f"Missing indexed fixtures: {', '.join(sorted(missing))}"
                )
            ranks = []
            store = ChatStore(pool)
            for (key, _), vector in zip(cases, vectors, strict=True):
                chunks = await store.find_relevant_chunks(vector, limit=5)
                rank = next(
                    (
                        i
                        for i, (chunk_id, _) in enumerate(chunks, 1)
                        if owners[chunk_id] == key
                    ),
                    None,
                )
                ranks.append(rank)
            print(
                f"Corpus: {len(rows)} chunks, {len(set(owners.values()))} indexed documents"
            )
            for k in (1, 3, 5):
                hits = sum(rank is not None and rank <= k for rank in ranks)
                print(f"Hit@{k}: {hits}/{len(cases)} ({hits / len(cases):.1%})")
    finally:
        await embeddings.close()


if __name__ == "__main__":
    asyncio.run(main())
