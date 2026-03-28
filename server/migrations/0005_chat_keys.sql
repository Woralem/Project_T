ALTER TABLE chat_members ADD COLUMN encrypted_chat_key JSONB;
ALTER TABLE chat_members ADD COLUMN member_key_id VARCHAR(64);