import asyncio
import os
from contextlib import closing
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from pgvector.psycopg import register_vector_async
from psycopg import AsyncConnection, DataError, sql
from psycopg_pool import AsyncConnectionPool

from ml.src.features.documents.chunker import Chunker
from ml.src.features.documents.processor import DocumentProcessor

MIGRATIONS = Path(__file__).resolve().parents[2] / "infra" / "postgres"


def test_concurrent_reindexing_and_rollback_with_pgvector():
    dsn = os.getenv("ML_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip(
            "Set ML_TEST_DATABASE_URL to a PostgreSQL test database with pgvector"
        )

    class TestEmbeddings:
        dimension = 384

        async def encode(self, chunks):
            return np.ones((len(chunks), self.dimension), dtype=np.float32)

    async def run():
        schema = f"ml_test_{uuid4().hex}"
        search_path = sql.SQL("SET search_path TO {}, public").format(
            sql.Identifier(schema)
        )

        async def configure(conn):
            await conn.execute(search_path)
            await register_vector_async(conn)

        async with await AsyncConnection.connect(dsn, autocommit=True) as admin:
            await admin.execute(
                sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema))
            )
            try:
                await admin.execute(search_path)
                for migration in (
                    "000001_create_documents",
                    "000004_create_document_chunks",
                ):
                    await admin.execute(
                        (MIGRATIONS / f"{migration}.up.sql").read_text()
                    )
                document = await admin.execute("""
                    INSERT INTO documents (title, description, text, category)
                    VALUES ('Title', 'Description', 'One. Two. Three.', 'company')
                    RETURNING id
                    """)
                (document_id,) = await document.fetchone()

                async with AsyncConnectionPool(
                    dsn,
                    open=False,
                    min_size=1,
                    max_size=2,
                    kwargs={"autocommit": True},
                    configure=configure,
                ) as pool:
                    model = TestEmbeddings()
                    processor = DocumentProcessor(pool, Chunker(9, 0), model)
                    assert await asyncio.gather(
                        processor.process(document_id), processor.process(document_id)
                    ) == [2, 2]

                    model.dimension = 383
                    with pytest.raises(DataError):
                        await processor.process(document_id)

                rows = await admin.execute("""
                    SELECT document_id, content, chunk_index, vector_dims(embedding)
                    FROM document_chunks ORDER BY chunk_index
                    """)
                assert await rows.fetchall() == [
                    (document_id, "One. Two.", 0, 384),
                    (document_id, "Three.", 1, 384),
                ]
            finally:
                await admin.execute(
                    sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
                )

    if os.name == "nt":
        with closing(asyncio.SelectorEventLoop()) as loop:
            loop.run_until_complete(run())
    else:
        asyncio.run(run())
