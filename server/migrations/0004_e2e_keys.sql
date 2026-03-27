-- server/migrations/0004_e2e_keys.sql

-- Публичные ключи пользователей для E2E
ALTER TABLE users ADD COLUMN identity_key TEXT;
ALTER TABLE users ADD COLUMN signing_key TEXT;
ALTER TABLE users ADD COLUMN key_signature TEXT;
ALTER TABLE users ADD COLUMN key_id VARCHAR(64);

-- Зашифрованный контент сообщений
ALTER TABLE messages ADD COLUMN encrypted_content JSONB;

-- Индекс для поиска по key_id
CREATE INDEX idx_users_key_id ON users(key_id) WHERE key_id IS NOT NULL;