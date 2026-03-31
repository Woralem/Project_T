CREATE TABLE IF NOT EXISTS read_receipts (
    chat_id            UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chat_id, user_id)
);