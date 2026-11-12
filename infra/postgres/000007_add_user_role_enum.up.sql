CREATE TYPE user_role AS ENUM ('admin', 'intern');

ALTER TABLE users
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE users RENAME COLUMN password TO password_hash;
