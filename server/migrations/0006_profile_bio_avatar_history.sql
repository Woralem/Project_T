ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';

CREATE TABLE avatar_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attachment_id UUID NOT NULL REFERENCES attachments(id),
    set_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_current    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_avatar_history_user ON avatar_history(user_id, set_at DESC);

INSERT INTO avatar_history (user_id, attachment_id, is_current, set_at)
SELECT id, avatar_id, TRUE, COALESCE(last_seen, NOW())
FROM users
WHERE avatar_id IS NOT NULL;