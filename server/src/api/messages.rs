use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared::MessageDto;
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct Params {
    pub limit: Option<i64>,
    /// Загрузить сообщения ДО этого ID (пагинация вверх)
    pub before: Option<Uuid>,
}

/// GET /api/chats/:chat_id/messages?limit=50&before=...
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Query(p): Query<Params>,
) -> Result<Json<Vec<MessageDto>>, AppError> {
    // Проверяем членство
    let (n,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM chat_members
         WHERE chat_id = $1 AND user_id = $2",
    )
    .bind(chat_id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;

    if n == 0 {
        return Err(AppError::Forbidden("не участник чата".into()));
    }

    let limit = p.limit.unwrap_or(50).min(200);

    let rows: Vec<(
        Uuid,
        Uuid,
        String,
        String,
        bool,
        chrono::DateTime<chrono::Utc>,
    )> = if let Some(before_id) = p.before {
        sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = $1
               AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
             ORDER BY m.created_at DESC
             LIMIT $3",
        )
        .bind(chat_id)
        .bind(before_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = $1
             ORDER BY m.created_at DESC
             LIMIT $2",
        )
        .bind(chat_id)
        .bind(limit)
        .fetch_all(&state.db)
        .await?
    };

    let mut msgs: Vec<MessageDto> = rows
        .into_iter()
        .map(|(id, sid, sname, content, edited, at)| MessageDto {
            id,
            chat_id,
            sender_id: sid,
            sender_name: sname,
            content,
            edited,
            created_at: at,
        })
        .collect();

    msgs.reverse(); // хронологический порядок
    Ok(Json(msgs))
}