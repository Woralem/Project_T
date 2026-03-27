use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared::{AttachmentDto, MessageDto};
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct Params {
    pub limit: Option<i64>,
    pub before: Option<Uuid>,
}

/// GET /api/chats/:chat_id/messages
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Query(p): Query<Params>,
) -> Result<Json<Vec<MessageDto>>, AppError> {
    let (n,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM chat_members WHERE chat_id=$1 AND user_id=$2")
            .bind(chat_id)
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;

    if n == 0 {
        return Err(AppError::Forbidden("не участник чата".into()));
    }

    let limit = p.limit.unwrap_or(50).min(200);

    type Row = (
        Uuid,
        Uuid,
        String,
        String,
        bool,
        chrono::DateTime<chrono::Utc>,
        Option<Uuid>,
        Option<String>,
        Option<String>,
        Option<i64>,
    );

    let rows: Vec<Row> = if let Some(before_id) = p.before {
        sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at,
                    a.id, a.filename, a.mime_type, a.size_bytes
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN attachments a ON a.id = m.attachment_id
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
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at,
                    a.id, a.filename, a.mime_type, a.size_bytes
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN attachments a ON a.id = m.attachment_id
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
        .map(
            |(id, sid, sname, content, edited, at, att_id, att_fn, att_mime, att_size)| {
                let attachment = att_id.map(|aid| AttachmentDto {
                    id: aid,
                    filename: att_fn.unwrap_or_default(),
                    mime_type: att_mime.unwrap_or_default(),
                    size_bytes: att_size.unwrap_or(0),
                });
                MessageDto {
                    id,
                    chat_id,
                    sender_id: sid,
                    sender_name: sname,
                    content,
                    edited,
                    created_at: at,
                    attachment,
                }
            },
        )
        .collect();

    msgs.reverse();
    Ok(Json(msgs))
}
