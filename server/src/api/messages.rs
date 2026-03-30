use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use shared::{AttachmentDto, EncryptedPayload, ForwardInfoDto, MessageDto, ReplyInfoDto};
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

    // 24 columns
    type Row = (
        Uuid,                          // m.id
        Uuid,                          // m.sender_id
        String,                        // u.display_name
        String,                        // m.content
        bool,                          // m.edited
        chrono::DateTime<chrono::Utc>, // m.created_at
        Option<Uuid>,                  // a.id
        Option<String>,                // a.filename
        Option<String>,                // a.mime_type
        Option<i64>,                   // a.size_bytes
        Option<serde_json::Value>,     // m.encrypted_content
        Option<Uuid>,                  // m.reply_to_id
        Option<Uuid>,                  // m.forwarded_from_id
        Option<String>,                // m.forwarded_from_name
        // reply message fields
        Option<Uuid>,              // rm.sender_id
        Option<String>,            // ru.display_name
        Option<String>,            // rm.content
        Option<serde_json::Value>, // rm.encrypted_content
        Option<Uuid>,              // ra.id
        Option<String>,            // ra.filename
        Option<String>,            // ra.mime_type
        Option<i64>,               // ra.size_bytes
    );

    let base_query = "
        SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at,
               a.id, a.filename, a.mime_type, a.size_bytes,
               m.encrypted_content,
               m.reply_to_id, m.forwarded_from_id, m.forwarded_from_name,
               rm.sender_id, ru.display_name, rm.content, rm.encrypted_content,
               ra.id, ra.filename, ra.mime_type, ra.size_bytes
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN attachments a ON a.id = m.attachment_id
        LEFT JOIN messages rm ON rm.id = m.reply_to_id
        LEFT JOIN users ru ON ru.id = rm.sender_id
        LEFT JOIN attachments ra ON ra.id = rm.attachment_id
    ";

    let rows: Vec<Row> = if let Some(before_id) = p.before {
        let q = format!(
            "{base_query} WHERE m.chat_id = $1 AND m.created_at < (SELECT created_at FROM messages WHERE id = $2) ORDER BY m.created_at DESC LIMIT $3"
        );
        sqlx::query_as(&q)
            .bind(chat_id)
            .bind(before_id)
            .bind(limit)
            .fetch_all(&state.db)
            .await?
    } else {
        let q = format!("{base_query} WHERE m.chat_id = $1 ORDER BY m.created_at DESC LIMIT $2");
        sqlx::query_as(&q)
            .bind(chat_id)
            .bind(limit)
            .fetch_all(&state.db)
            .await?
    };

    let mut msgs: Vec<MessageDto> = rows
        .into_iter()
        .map(
            |(
                id,
                sid,
                sname,
                content,
                edited,
                at,
                att_id,
                att_fn,
                att_mime,
                att_size,
                enc_json,
                reply_to_id,
                fwd_from_id,
                fwd_from_name,
                r_sid,
                r_sname,
                r_content,
                r_enc,
                ra_id,
                ra_fn,
                ra_mime,
                ra_size,
            )| {
                let attachment = att_id.map(|aid| AttachmentDto {
                    id: aid,
                    filename: att_fn.unwrap_or_default(),
                    mime_type: att_mime.unwrap_or_default(),
                    size_bytes: att_size.unwrap_or(0),
                });
                let encrypted: Option<EncryptedPayload> =
                    enc_json.and_then(|v| serde_json::from_value(v).ok());

                let reply_to = if let (Some(rid), Some(rsid), Some(rsname), Some(rcontent)) =
                    (reply_to_id, r_sid, r_sname, r_content)
                {
                    let r_attachment = ra_id.map(|raid| AttachmentDto {
                        id: raid,
                        filename: ra_fn.unwrap_or_default(),
                        mime_type: ra_mime.unwrap_or_default(),
                        size_bytes: ra_size.unwrap_or(0),
                    });
                    let r_encrypted: Option<EncryptedPayload> =
                        r_enc.and_then(|v| serde_json::from_value(v).ok());
                    Some(Box::new(ReplyInfoDto {
                        id: rid,
                        sender_id: rsid,
                        sender_name: rsname,
                        content: rcontent,
                        attachment: r_attachment,
                        encrypted: r_encrypted,
                    }))
                } else {
                    None
                };

                let forwarded_from = fwd_from_id.map(|fid| ForwardInfoDto {
                    original_message_id: fid,
                    original_sender_name: fwd_from_name.unwrap_or_default(),
                    original_chat_name: None,
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
                    encrypted,
                    reply_to,
                    forwarded_from,
                }
            },
        )
        .collect();

    msgs.reverse();
    Ok(Json(msgs))
}
