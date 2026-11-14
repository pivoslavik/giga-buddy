ALTER TABLE messages
    DROP COLUMN created_at,
    ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending',
    ALTER COLUMN role TYPE VARCHAR(50)
        USING role::text;

ALTER TABLE messages
    ALTER COLUMN status DROP DEFAULT;

DROP TYPE message_role;
