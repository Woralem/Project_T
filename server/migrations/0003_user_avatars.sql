-- server/migrations/0003_user_avatars.sql

ALTER TABLE users ADD COLUMN avatar_id UUID REFERENCES attachments(id);

-- Индекс для быстрого получения аватарки
CREATE INDEX idx_users_avatar ON users(avatar_id) WHERE avatar_id IS NOT NULL;