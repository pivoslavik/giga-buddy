ALTER TABLE users
    ALTER COLUMN role TYPE VARCHAR(50) USING role::text;

DROP TYPE user_role;

ALTER TABLE users RENAME COLUMN password_hash TO password;
