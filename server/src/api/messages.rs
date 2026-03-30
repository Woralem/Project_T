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

    // 14 columns — fits within sqlx tuple limit of 16
    type Row = (
        Uuid,                          // 1  m.id
        Uuid,                          // 2  m.sender_id
        String,                        // 3  u.display_name
        String,                        // 4  m.content
        bool,                          // 5  m.edited
        chrono::DateTime<chrono::Utc>, // 6  m.created_at
        Option<Uuid>,                  // 7  a.id
        Option<String>,                // 8  a.filename
        Option<String>,                // 9  a.mime_type
        Option<i64>,                   // 10 a.size_bytes
        Option<serde_json::Value>,     // 11 m.encrypted_content
        Option<Uuid>,                  // 12 m.reply_to_id
        Option<Uuid>,                  // 13 m.forwarded_from_id
        Option<String>,                // 14 m.forwarded_from_name
    );

    let rows: Vec<Row> = if let Some(before_id) = p.before {
        sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at,
                    a.id, a.filename, a.mime_type, a.size_bytes,
                    m.encrypted_content,
                    m.reply_to_id, m.forwarded_from_id, m.forwarded_from_name
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
                    a.id, a.filename, a.mime_type, a.size_bytes,
                    m.encrypted_content,
                    m.reply_to_id, m.forwarded_from_id, m.forwarded_from_name
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

    // Collect reply_to_ids to batch-fetch
    let reply_ids: Vec<Uuid> = rows
        .iter()
        .filter_map(|r| r.11)
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Fetch reply infos in batch
    let reply_map = if !reply_ids.is_empty() {
        fetch_reply_infos(&state, &reply_ids).await
    } else {
        std::collections::HashMap::new()
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
            )| {
                let attachment = att_id.map(|aid| AttachmentDto {
                    id: aid,
                    filename: att_fn.unwrap_or_default(),
                    mime_type: att_mime.unwrap_or_default(),
                    size_bytes: att_size.unwrap_or(0),
                });
                let encrypted: Option<EncryptedPayload> =
                    enc_json.and_then(|v| serde_json::from_value(v).ok());

                let reply_to =
                    reply_to_id.and_then(|rid| reply_map.get(&rid).cloned().map(Box::new));

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

/// Batch-fetch reply info for a set of message IDs
async fn fetch_reply_infos(
    state: &AppState,
    ids: &[Uuid],
) -> std::collections::HashMap<Uuid, ReplyInfoDto> {
    // sqlx doesn't support WHERE IN with bind directly for Vec<Uuid>,
    // so we query one by one. For small batches this is fine.
    let mut map = std::collections::HashMap::new();

    for &id in ids {
        // 8 columns — well within limit
        type ReplyRow = (
            Uuid,                      // m.id
            Uuid,                      // m.sender_id
            String,                    // u.display_name
            String,                    // m.content
            Option<serde_json::Value>, // m.encrypted_content
            Option<Uuid>,              // a.id
            Option<String>,            // a.filename
            Option<String>,            // a.mime_type
        );

        let row: Option<ReplyRow> = sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.encrypted_content,
                    a.id, a.filename, a.mime_type
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             LEFT JOIN attachments a ON a.id = m.attachment_id
             WHERE m.id = $1",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some((mid, sid, sname, content, enc_json, att_id, att_fn, att_mime)) = row {
            let attachment = att_id.map(|aid| AttachmentDto {
                id: aid,
                filename: att_fn.unwrap_or_default(),
                mime_type: att_mime.unwrap_or_default(),
                size_bytes: 0,
            });
            let encrypted: Option<EncryptedPayload> =
                enc_json.and_then(|v| serde_json::from_value(v).ok());

            map.insert(
                mid,
                ReplyInfoDto {
                    id: mid,
                    sender_id: sid,
                    sender_name: sname,
                    content,
                    attachment,
                    encrypted,
                },
            );
        }
    }

    map
}
