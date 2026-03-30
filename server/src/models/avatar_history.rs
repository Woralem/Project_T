use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct AvatarHistory {
    pub id: Uuid,
    pub user_id: Uuid,
    pub attachment_id: Uuid,
    pub set_at: DateTime<Utc>,
    pub is_current: bool,
}
