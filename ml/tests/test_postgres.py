import asyncio
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import numpy as np
import pytest
from pgvector.asyncpg import register_vector

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
        # UUID hex keeps the SQL identifier under our control.
        schema = f"ml_test_{uuid4().hex}"
        admin = await asyncpg.connect(dsn)
        try:
            await admin.execute(f"CREATE SCHEMA {schema}")
            await admin.execute(f"SET search_path TO {schema}, public")
            for migration in (
                "000001_create_documents",
                "000004_create_document_chunks",
            ):
                await admin.execute((MIGRATIONS / f"{migration}.up.sql").read_text())
            vector_schema = await admin.fetchval("""
                SELECT n.nspname FROM pg_extension e
                JOIN pg_namespace n ON n.oid = e.extnamespace
                WHERE e.extname = 'vector'
                """)
            document_id = await admin.fetchval("""
                INSERT INTO documents (title, description, text, category)
                VALUES ('Title', 'Description', 'One. Two. Three.', 'company')
                RETURNING id
                """)

            async def configure(conn):
                await register_vector(conn, schema=vector_schema)

            async with asyncpg.create_pool(
                dsn,
                min_size=1,
                max_size=2,
                server_settings={"search_path": f"{schema},public"},
                init=configure,
            ) as pool:
                model = TestEmbeddings()
                processor = DocumentProcessor(pool, Chunker(9, 0), model)
                assert await asyncio.gather(
                    processor.process(document_id), processor.process(document_id)
                ) == [2, 2]

                model.dimension = 383
                with pytest.raises(asyncpg.DataError):
                    await processor.process(document_id)

            rows = await admin.fetch("""
                SELECT document_id, content, chunk_index, vector_dims(embedding)
                FROM document_chunks ORDER BY chunk_index
                """)
            assert [tuple(row) for row in rows] == [
                (document_id, "One. Two.", 0, 384),
                (document_id, "Three.", 1, 384),
            ]
        finally:
            try:
                await admin.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
            finally:
                await admin.close()

    asyncio.run(run())
