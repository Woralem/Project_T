use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
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
