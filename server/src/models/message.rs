use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct Message {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub sender_id: Uuid,
    pub content: String,
    pub edited: bool,
    pub created_at: DateTime<Utc>,
    pub attachment_id: Option<Uuid>,
    pub encrypted_content: Option<serde_json::Value>,
}
