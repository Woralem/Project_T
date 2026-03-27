CREATE TABLE attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES users(id),
    filename    TEXT NOT NULL,
    mime_type   VARCHAR(128) NOT NULL,
    size_bytes  BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE messages ADD COLUMN attachment_id UUID REFERENCES attachments(id);