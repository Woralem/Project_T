use axum::{
    extract::{Path, State},
    Json,
};
use shared::{
    AttachmentDto, ChatDto, ChatMemberDto, EncryptedChatKey, MessageDto, PublicKeyBundle,
    UpdateChatKeysReq,
};
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, models, state::AppState};

/// POST /api/chats
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<shared::CreateChatReq>,
) -> Result<Json<ChatDto>, AppError> {
    if req.member_ids.is_empty() {
        return Err(AppError::BadRequest("нужен хотя бы 1 участник".into()));
    }

    if !req.is_group && req.member_ids.len() == 1 {
        let other = req.member_ids[0];
        let existing: Option<(Uuid,)> = sqlx::query_as(
            "SELECT c.id FROM chats c
             JOIN chat_members a ON a.chat_id = c.id AND a.user_id = $1
             JOIN chat_members b ON b.chat_id = c.id AND b.user_id = $2
             WHERE c.is_group = FALSE LIMIT 1",
        )
        .bind(auth.user_id)
        .bind(other)
        .fetch_optional(&state.db)
        .await?;

        if let Some((chat_id,)) = existing {
            return chat_dto(&state, chat_id).await.map(Json);
        }
    }

    let chat_id = Uuid::new_v4();

    sqlx::query("INSERT INTO chats (id, is_group, name, created_by) VALUES ($1,$2,$3,$4)")
        .bind(chat_id)
        .bind(req.is_group)
        .bind(&req.name)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    sqlx::query("INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'owner')")
        .bind(chat_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    for &uid in &req.member_ids {
        if uid != auth.user_id {
            sqlx::query(
                "INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING",
            )
            .bind(chat_id)
            .bind(uid)
            .execute(&state.db)
            .await?;
        }
    }

    chat_dto(&state, chat_id).await.map(Json)
}

/// GET /api/chats
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<ChatDto>>, AppError> {
    let ids: Vec<(Uuid,)> = sqlx::query_as("SELECT chat_id FROM chat_members WHERE user_id = $1")
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?;

    let mut chats = Vec::new();
    for (cid,) in ids {
        chats.push(chat_dto(&state, cid).await?);
    }

    chats.sort_by(|a, b| {
        let ta = a.last_message.as_ref().map(|m| m.created_at);
        let tb = b.last_message.as_ref().map(|m| m.created_at);
        tb.cmp(&ta)
    });

    Ok(Json(chats))
}

/// GET /api/chats/:chat_id
pub async fn get(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> Result<Json<ChatDto>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;
    chat_dto(&state, chat_id).await.map(Json)
}

/// PUT /api/chats/:chat_id/keys
pub async fn update_keys(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(req): Json<UpdateChatKeysReq>,
) -> Result<Json<()>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;

    for (uid, enc_key) in req.encrypted_keys {
        let enc_key_json =
            serde_json::to_value(&enc_key).map_err(|e| AppError::Internal(format!("json: {e}")))?;

        let user_key_id: Option<(Option<String>,)> =
            sqlx::query_as("SELECT key_id FROM users WHERE id = $1")
                .bind(uid)
                .fetch_optional(&state.db)
                .await?;

        let key_id = user_key_id.and_then(|r| r.0);

        sqlx::query(
            "UPDATE chat_members SET encrypted_chat_key = $1, member_key_id = $2
             WHERE chat_id = $3 AND user_id = $4",
        )
        .bind(&enc_key_json)
        .bind(&key_id)
        .bind(chat_id)
        .bind(uid)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(()))
}

async fn ensure_member(state: &AppState, chat_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let (n,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM chat_members WHERE chat_id=$1 AND user_id=$2")
            .bind(chat_id)
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;

    if n == 0 {
        Err(AppError::Forbidden("не участник чата".into()))
    } else {
        Ok(())
    }
}

async fn chat_dto(state: &AppState, chat_id: Uuid) -> Result<ChatDto, AppError> {
    let chat: models::Chat = sqlx::query_as("SELECT * FROM chats WHERE id = $1")
        .bind(chat_id)
        .fetch_one(&state.db)
        .await?;

    type MemberRow = (
        Uuid,
        String,
        String,
        String,
        Option<Uuid>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<serde_json::Value>,
        Option<String>,
    );

    let rows: Vec<MemberRow> = sqlx::query_as(
        "SELECT u.id, u.username, u.display_name, cm.role,
                u.avatar_id, u.identity_key, u.signing_key, u.key_signature, u.key_id,
                cm.encrypted_chat_key, cm.member_key_id
         FROM chat_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = $1",
    )
    .bind(chat_id)
    .fetch_all(&state.db)
    .await?;

    let mut members = Vec::new();
    for (
        uid,
        uname,
        dname,
        role,
        avatar_id,
        identity_key,
        signing_key,
        key_sig,
        key_id,
        enc_chat_key_json,
        member_key_id,
    ) in &rows
    {
        let avatar_url = avatar_id.map(|id| format!("/api/files/{}", id));

        let public_keys = if identity_key.is_some() {
            Some(PublicKeyBundle {
                identity_key: identity_key.clone().unwrap_or_default(),
                signing_key: signing_key.clone().unwrap_or_default(),
                signature: key_sig.clone().unwrap_or_default(),
                key_id: key_id.clone().unwrap_or_default(),
            })
        } else {
            None
        };

        let encrypted_chat_key: Option<EncryptedChatKey> = enc_chat_key_json
            .as_ref()
            .and_then(|v| serde_json::from_value(v.clone()).ok());

        members.push(ChatMemberDto {
            user_id: *uid,
            username: uname.clone(),
            display_name: dname.clone(),
            role: role.clone(),
            online: state.is_online(uid).await,
            avatar_url,
            public_keys,
            encrypted_chat_key,
            member_key_id: member_key_id.clone(),
        });
    }

    type LastRow = (
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

    let last: Option<LastRow> = sqlx::query_as(
        "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at,
                a.id, a.filename, a.mime_type, a.size_bytes
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN attachments a ON a.id = m.attachment_id
         WHERE m.chat_id = $1
         ORDER BY m.created_at DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&state.db)
    .await?;

    let last_message = last.map(
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
                encrypted: None,
                reply_to: None,
                forwarded_from: None,
            }
        },
    );

    Ok(ChatDto {
        id: chat.id,
        is_group: chat.is_group,
        name: chat.name,
        members,
        last_message,
        unread_count: 0,
        created_at: chat.created_at,
    })
}
