CREATE TYPE message_role AS ENUM ('user', 'assistant');

ALTER TABLE messages
	ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	DROP COLUMN status,

	ALTER column role TYPE message_role
		USING role::message_role;
