use axum::{
    extract::{Path, State},
    Json,
};
use shared::{ChatDto, ChatMemberDto, CreateChatReq, MessageDto};
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, models, state::AppState};

/// POST /api/chats
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateChatReq>,
) -> Result<Json<ChatDto>, AppError> {
    if req.member_ids.is_empty() {
        return Err(AppError::BadRequest("нужен хотя бы 1 участник".into()));
    }

    // Для личных чатов — не создаём дубль
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

    sqlx::query(
        "INSERT INTO chats (id, is_group, name, created_by) VALUES ($1,$2,$3,$4)",
    )
    .bind(chat_id)
    .bind(req.is_group)
    .bind(&req.name)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Создатель = owner
    sqlx::query(
        "INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1,$2,'owner')",
    )
    .bind(chat_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Остальные участники
    for &uid in &req.member_ids {
        if uid != auth.user_id {
            sqlx::query(
                "INSERT INTO chat_members (chat_id, user_id, role)
                 VALUES ($1,$2,'member')
                 ON CONFLICT DO NOTHING",
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
    let ids: Vec<(Uuid,)> =
        sqlx::query_as("SELECT chat_id FROM chat_members WHERE user_id = $1")
            .bind(auth.user_id)
            .fetch_all(&state.db)
            .await?;

    let mut chats = Vec::new();
    for (cid,) in ids {
        chats.push(chat_dto(&state, cid).await?);
    }

    // Сортируем по последнему сообщению
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

// ── Helpers ──────────────────────────────────────────────

async fn ensure_member(
    state: &AppState,
    chat_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let (n,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM chat_members
         WHERE chat_id = $1 AND user_id = $2",
    )
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
    let chat: models::Chat =
        sqlx::query_as("SELECT * FROM chats WHERE id = $1")
            .bind(chat_id)
            .fetch_one(&state.db)
            .await?;

    // Участники
    let rows: Vec<(Uuid, String, String, String)> = sqlx::query_as(
        "SELECT u.id, u.username, u.display_name, cm.role
         FROM chat_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = $1",
    )
    .bind(chat_id)
    .fetch_all(&state.db)
    .await?;

    let mut members = Vec::new();
    for (uid, uname, dname, role) in &rows {
        members.push(ChatMemberDto {
            user_id: *uid,
            username: uname.clone(),
            display_name: dname.clone(),
            role: role.clone(),
            online: state.is_online(uid).await,
        });
    }

    // Последнее сообщение
    let last: Option<(Uuid, Uuid, String, String, bool, chrono::DateTime<chrono::Utc>)> =
        sqlx::query_as(
            "SELECT m.id, m.sender_id, u.display_name, m.content, m.edited, m.created_at
             FROM messages m JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = $1 ORDER BY m.created_at DESC LIMIT 1",
        )
        .bind(chat_id)
        .fetch_optional(&state.db)
        .await?;

    let last_message = last.map(|(id, sid, sname, content, edited, at)| MessageDto {
        id,
        chat_id,
        sender_id: sid,
        sender_name: sname,
        content,
        edited,
        created_at: at,
    });

    Ok(ChatDto {
        id: chat.id,
        is_group: chat.is_group,
        name: chat.name,
        members,
        last_message,
        unread_count: 0, // TODO: трекинг прочтений
        created_at: chat.created_at,
    })
}