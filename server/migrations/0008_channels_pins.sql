ALTER TABLE chats ADD COLUMN is_channel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_members ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE chat_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id     UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    code        VARCHAR(32) UNIQUE NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    max_uses    INT,
    use_count   INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_chat_invites_code ON chat_invites(code);
CREATE INDEX idx_chat_invites_chat ON chat_invites(chat_id);