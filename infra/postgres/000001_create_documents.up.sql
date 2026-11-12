CREATE TYPE document_category AS ENUM (
    'start_work',
    'development',
    'work_processes',
    'team_values',
    'contacts',
    'ai_answers',
    'company'
);

CREATE TABLE documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    description TEXT NOT NULL CHECK (btrim(description) <> ''),
    text TEXT NOT NULL CHECK (btrim(text) <> ''),
    category document_category NOT NULL
);
