ALTER TABLE documents
ADD COLUMN google_document_id TEXT UNIQUE NOT NULL CHECK(btrim(google_document_id) <> ''),
ADD COLUMN source_modified_at TIMESTAMPTZ NOT NULL;
