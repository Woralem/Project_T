use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub avatar_id: Option<Uuid>,
    pub identity_key: Option<String>,
    pub signing_key: Option<String>,
    pub key_signature: Option<String>,
    pub key_id: Option<String>,
    pub bio: String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct Invite {
    pub id: Uuid,
    pub code: String,
    pub created_by: Uuid,
    pub used_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub used: bool,
}

#[derive(Debug, sqlx::FromRow)]
pub struct Chat {
    pub id: Uuid,
    pub is_group: bool,
    pub is_channel: bool,
    pub name: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub avatar_id: Option<Uuid>, // ★ NEW
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ChatMember {
    pub chat_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub encrypted_chat_key: Option<serde_json::Value>,
    pub member_key_id: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Message {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub sender_id: Uuid,
    pub content: String,
    pub edited: bool,
    pub created_at: DateTime<Utc>,
    pub attachment_id: Option<Uuid>,
    pub encrypted_content: Option<serde_json::Value>,
    pub reply_to_id: Option<Uuid>,
    pub forwarded_from_id: Option<Uuid>,
    pub forwarded_from_name: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Attachment {
    pub id: Uuid,
    pub uploader_id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AvatarHistory {
    pub id: Uuid,
    pub user_id: Uuid,
    pub attachment_id: Uuid,
    pub set_at: DateTime<Utc>,
    pub is_current: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ReadReceipt {
    pub chat_id: Uuid,
    pub user_id: Uuid,
    pub last_read_message_id: Uuid,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ChatInvite {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub code: String,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: Option<i32>,
    pub use_count: i32,
}
