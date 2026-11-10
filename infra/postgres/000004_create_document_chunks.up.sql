CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL,
    chunk_index INTEGER NOT NULL,
    UNIQUE (document_id, chunk_index)
);