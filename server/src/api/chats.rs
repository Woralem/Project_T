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
    let is_channel = req.is_channel.unwrap_or(false);

    sqlx::query(
        "INSERT INTO chats (id, is_group, is_channel, name, created_by) VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(chat_id)
    .bind(req.is_group)
    .bind(is_channel)
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

// ★ ИСПРАВЛЕНО — включает avatar_url
async fn chat_dto(state: &AppState, chat_id: Uuid) -> Result<ChatDto, AppError> {
    let chat: models::Chat = sqlx::query_as("SELECT * FROM chats WHERE id = $1")
        .bind(chat_id)
        .fetch_one(&state.db)
        .await?;

    // ★ Аватарка чата
    let chat_avatar_url = chat.avatar_id.map(|id| format!("/api/files/{}", id));

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
        bool,
    );

    let rows: Vec<MemberRow> = sqlx::query_as(
        "SELECT u.id, u.username, u.display_name, cm.role,
                u.avatar_id, u.identity_key, u.signing_key, u.key_signature, u.key_id,
                cm.encrypted_chat_key, cm.member_key_id,
                cm.is_pinned
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
        is_pinned,
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
            is_pinned: *is_pinned,
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
        is_channel: chat.is_channel,
        name: chat.name,
        members,
        last_message,
        unread_count: 0,
        created_at: chat.created_at,
        avatar_url: chat_avatar_url, // ★ NEW
    })
}

/// DELETE /api/chats/:chat_id
pub async fn delete_chat(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> Result<Json<()>, AppError> {
    let role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2")
            .bind(chat_id)
            .bind(auth.user_id)
            .fetch_optional(&state.db)
            .await?;

    let role = role.ok_or_else(|| AppError::Forbidden("не участник чата".into()))?;
    if role.0 != "owner" {
        return Err(AppError::Forbidden(
            "только создатель может удалить чат".into(),
        ));
    }

    let member_ids: Vec<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM chat_members WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_all(&state.db)
            .await?;

    sqlx::query("DELETE FROM chats WHERE id = $1")
        .bind(chat_id)
        .execute(&state.db)
        .await?;

    let msg = shared::WsServerMsg::ChatDeleted { chat_id };
    for (uid,) in member_ids {
        if uid != auth.user_id {
            state.send_to_user(&uid, msg.clone()).await;
        }
    }

    Ok(Json(()))
}

/// POST /api/chats/:chat_id/leave
pub async fn leave_chat(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> Result<Json<()>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;

    sqlx::query("DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2")
        .bind(chat_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    let (remaining,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM chat_members WHERE chat_id = $1")
            .bind(chat_id)
            .fetch_one(&state.db)
            .await?;

    if remaining == 0 {
        sqlx::query("DELETE FROM chats WHERE id = $1")
            .bind(chat_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(()))
}

/// POST /api/chats/:chat_id/pin
pub async fn toggle_pin(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> Result<Json<()>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;

    let (current,): (bool,) =
        sqlx::query_as("SELECT is_pinned FROM chat_members WHERE chat_id = $1 AND user_id = $2")
            .bind(chat_id)
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;

    sqlx::query("UPDATE chat_members SET is_pinned = $1 WHERE chat_id = $2 AND user_id = $3")
        .bind(!current)
        .bind(chat_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    Ok(Json(()))
}

/// POST /api/chats/:chat_id/invite
pub async fn create_chat_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(req): Json<shared::CreateChatInviteReq>,
) -> Result<Json<shared::ChatInviteDto>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;

    let code: String = {
        use rand::Rng;
        const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        let mut rng = rand::thread_rng();
        (0..10)
            .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
            .collect()
    };

    let expires_at = req
        .expires_in_hours
        .map(|h| chrono::Utc::now() + chrono::Duration::hours(h));
    let id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO chat_invites (id, chat_id, code, created_by, expires_at, max_uses) VALUES ($1,$2,$3,$4,$5,$6)"
    ).bind(id).bind(chat_id).bind(&code).bind(auth.user_id).bind(expires_at).bind(req.max_uses)
    .execute(&state.db).await?;

    Ok(Json(shared::ChatInviteDto {
        id,
        chat_id,
        code,
        created_at: chrono::Utc::now(),
        expires_at,
        max_uses: req.max_uses,
        use_count: 0,
    }))
}

/// GET /api/chats/:chat_id/invites
pub async fn list_chat_invites(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> Result<Json<Vec<shared::ChatInviteDto>>, AppError> {
    ensure_member(&state, chat_id, auth.user_id).await?;
    let rows: Vec<models::ChatInvite> =
        sqlx::query_as("SELECT * FROM chat_invites WHERE chat_id = $1 ORDER BY created_at DESC")
            .bind(chat_id)
            .fetch_all(&state.db)
            .await?;

    Ok(Json(
        rows.into_iter()
            .map(|r| shared::ChatInviteDto {
                id: r.id,
                chat_id: r.chat_id,
                code: r.code,
                created_at: r.created_at,
                expires_at: r.expires_at,
                max_uses: r.max_uses,
                use_count: r.use_count,
            })
            .collect(),
    ))
}

/// POST /api/join/:code
pub async fn join_by_code(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(code): Path<String>,
) -> Result<Json<shared::ChatDto>, AppError> {
    let invite: Option<models::ChatInvite> =
        sqlx::query_as("SELECT * FROM chat_invites WHERE code = $1")
            .bind(&code)
            .fetch_optional(&state.db)
            .await?;

    let invite = invite.ok_or_else(|| AppError::NotFound("Ссылка не найдена".into()))?;

    if invite.expires_at.map_or(false, |e| e < chrono::Utc::now()) {
        return Err(AppError::BadRequest("Ссылка истекла".into()));
    }
    if invite.max_uses.map_or(false, |max| invite.use_count >= max) {
        return Err(AppError::BadRequest("Лимит использований исчерпан".into()));
    }

    let (n,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM chat_members WHERE chat_id=$1 AND user_id=$2")
            .bind(invite.chat_id)
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;

    if n > 0 {
        return chat_dto(&state, invite.chat_id).await.map(Json);
    }

    sqlx::query("INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'member')")
        .bind(invite.chat_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    sqlx::query("UPDATE chat_invites SET use_count = use_count + 1 WHERE id = $1")
        .bind(invite.id)
        .execute(&state.db)
        .await?;

    chat_dto(&state, invite.chat_id).await.map(Json)
}

/// POST /api/chats/:chat_id/kick/:user_id
pub async fn kick_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((chat_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<()>, AppError> {
    let role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2")
            .bind(chat_id)
            .bind(auth.user_id)
            .fetch_optional(&state.db)
            .await?;

    let role = role.ok_or_else(|| AppError::Forbidden("не участник чата".into()))?;
    if role.0 != "owner" && role.0 != "admin" {
        return Err(AppError::Forbidden("недостаточно прав".into()));
    }

    let target_role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2")
            .bind(chat_id)
            .bind(target_user_id)
            .fetch_optional(&state.db)
            .await?;

    if let Some(tr) = &target_role {
        if tr.0 == "owner" {
            return Err(AppError::Forbidden("нельзя удалить создателя".into()));
        }
    }

    sqlx::query("DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2")
        .bind(chat_id)
        .bind(target_user_id)
        .execute(&state.db)
        .await?;

    state
        .send_to_user(
            &target_user_id,
            shared::WsServerMsg::ChatDeleted { chat_id },
        )
        .await;

    Ok(Json(()))
}

// ★ ИСПРАВЛЕНО — сохраняет avatar_id и возвращает avatar_url
/// POST /api/chats/:chat_id/avatar
pub async fn upload_chat_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    let role: Option<(String,)> =
        sqlx::query_as("SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2")
            .bind(chat_id)
            .bind(auth.user_id)
            .fetch_optional(&state.db)
            .await?;

    let role = role.ok_or_else(|| AppError::Forbidden("не участник чата".into()))?;
    if role.0 != "owner" && role.0 != "admin" {
        return Err(AppError::Forbidden("недостаточно прав".into()));
    }

    while let Some(field) = multipart.next_field().await? {
        if field.name() != Some("avatar") {
            continue;
        }
        let mime = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        let data = field.bytes().await?;
        if data.is_empty() || data.len() > 5 * 1024 * 1024 {
            return Err(AppError::BadRequest("Невалидный файл".into()));
        }

        let att_id = Uuid::new_v4();
        let path = format!("{}/{}", state.config.upload_dir, att_id);
        tokio::fs::write(&path, &data)
            .await
            .map_err(|e| AppError::Internal(format!("write: {e}")))?;

        sqlx::query("INSERT INTO attachments (id, uploader_id, filename, mime_type, size_bytes) VALUES ($1,$2,$3,$4,$5)")
            .bind(att_id).bind(auth.user_id).bind("chat_avatar").bind(&mime).bind(data.len() as i64)
            .execute(&state.db).await?;

        // ★ Сохраняем avatar_id в таблицу chats
        sqlx::query("UPDATE chats SET avatar_id = $1 WHERE id = $2")
            .bind(att_id)
            .bind(chat_id)
            .execute(&state.db)
            .await?;

        let avatar_url = format!("/api/files/{}", att_id);

        tracing::info!(%chat_id, %att_id, "chat avatar uploaded");

        return Ok(Json(serde_json::json!({ "avatar_url": avatar_url })));
    }

    Err(AppError::BadRequest("Файл не найден".into()))
}
