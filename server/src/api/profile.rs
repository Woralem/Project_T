use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::header,
    response::Response,
    Json,
};
use shared::{
    AvatarHistoryDto, PublicKeyBundle, UpdateAvatarRes, UpdateProfileReq, UserDto, UserProfileDto,
};
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, models, state::AppState};

const MAX_AVATAR_SIZE: usize = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];

/// GET /api/users/:user_id/profile
pub async fn get_profile(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> Result<Json<UserProfileDto>, AppError> {
    let user: models::User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Пользователь не найден".into()))?;

    let avatar_url = user.avatar_id.map(|id| format!("/api/files/{}", id));

    let public_keys = if user.identity_key.is_some() {
        Some(PublicKeyBundle {
            identity_key: user.identity_key.unwrap_or_default(),
            signing_key: user.signing_key.unwrap_or_default(),
            signature: user.key_signature.unwrap_or_default(),
            key_id: user.key_id.unwrap_or_default(),
        })
    } else {
        None
    };

    type AvatarRow = (Uuid, Uuid, chrono::DateTime<chrono::Utc>, bool);
    let avatar_rows: Vec<AvatarRow> = sqlx::query_as(
        "SELECT id, attachment_id, set_at, is_current FROM avatar_history
         WHERE user_id = $1 ORDER BY set_at DESC LIMIT 50",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let avatars: Vec<AvatarHistoryDto> = avatar_rows
        .into_iter()
        .map(|(id, att_id, set_at, is_current)| AvatarHistoryDto {
            id,
            url: format!("/api/files/{}", att_id),
            set_at,
            is_current,
        })
        .collect();

    Ok(Json(UserProfileDto {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        online: state.is_online(&user.id).await,
        last_seen: user.last_seen,
        avatar_url,
        avatars,
        created_at: user.created_at,
        public_keys,
    }))
}

/// PUT /api/users/me
pub async fn update_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateProfileReq>,
) -> Result<Json<UserDto>, AppError> {
    if let Some(ref name) = req.display_name {
        let char_count = name.chars().count();
        if char_count == 0 || char_count > 64 {
            return Err(AppError::BadRequest("display_name: 1-64 символов".into()));
        }
        sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
            .bind(name)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref bio) = req.bio {
        if bio.chars().count() > 200 {
            return Err(AppError::BadRequest("bio: максимум 200 символов".into()));
        }
        sqlx::query("UPDATE users SET bio = $1 WHERE id = $2")
            .bind(bio)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    if let Some(ref keys) = req.public_keys {
        validate_public_keys(keys)?;

        sqlx::query(
            "UPDATE users SET identity_key = $1, signing_key = $2, key_signature = $3, key_id = $4 WHERE id = $5",
        )
        .bind(&keys.identity_key)
        .bind(&keys.signing_key)
        .bind(&keys.signature)
        .bind(&keys.key_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    }

    let user = get_user_dto(&state, auth.user_id).await?;

    if req.public_keys.is_some() || req.display_name.is_some() || req.bio.is_some() {
        broadcast_user_update(&state, auth.user_id, user.clone()).await;
    }

    Ok(Json(user))
}

/// POST /api/users/me/avatar
pub async fn upload_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<UpdateAvatarRes>, AppError> {
    while let Some(field) = multipart.next_field().await? {
        if field.name() != Some("avatar") {
            continue;
        }

        let mime = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        if !ALLOWED_AVATAR_TYPES.contains(&mime.as_str()) {
            return Err(AppError::BadRequest(
                "Разрешены только изображения (JPEG, PNG, WebP, GIF)".into(),
            ));
        }

        let data = field.bytes().await?;

        if data.len() > MAX_AVATAR_SIZE {
            return Err(AppError::BadRequest(
                "Аватарка слишком большая (макс 5MB)".into(),
            ));
        }

        if data.is_empty() {
            return Err(AppError::BadRequest("Пустой файл".into()));
        }

        // Помечаем предыдущую аватарку как не текущую (сохраняем в истории)
        sqlx::query(
            "UPDATE avatar_history SET is_current = FALSE WHERE user_id = $1 AND is_current = TRUE",
        )
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

        // Загружаем новый файл
        let att_id = Uuid::new_v4();
        let filename = format!("avatar_{}.{}", auth.user_id, get_extension(&mime));
        let path = format!("{}/{}", state.config.upload_dir, att_id);

        tokio::fs::write(&path, &data)
            .await
            .map_err(|e| AppError::Internal(format!("write file: {e}")))?;

        let size = data.len() as i64;

        sqlx::query(
            "INSERT INTO attachments (id, uploader_id, filename, mime_type, size_bytes)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(att_id)
        .bind(auth.user_id)
        .bind(&filename)
        .bind(&mime)
        .bind(size)
        .execute(&state.db)
        .await?;

        // Обновляем avatar_id пользователя
        sqlx::query("UPDATE users SET avatar_id = $1 WHERE id = $2")
            .bind(att_id)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;

        // Добавляем в историю как текущую
        sqlx::query(
            "INSERT INTO avatar_history (user_id, attachment_id, is_current) VALUES ($1, $2, TRUE)",
        )
        .bind(auth.user_id)
        .bind(att_id)
        .execute(&state.db)
        .await?;

        let avatar_url = format!("/api/files/{}", att_id);

        tracing::info!(user_id = %auth.user_id, %att_id, "avatar uploaded");

        let user = get_user_dto(&state, auth.user_id).await?;
        broadcast_user_update(&state, auth.user_id, user).await;

        return Ok(Json(UpdateAvatarRes { avatar_url }));
    }

    Err(AppError::BadRequest(
        "Не найден файл avatar в запросе".into(),
    ))
}

/// DELETE /api/users/me/avatar — снять текущую аватарку (оставить в истории)
pub async fn delete_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<()>, AppError> {
    // Помечаем текущую аватарку как не текущую
    sqlx::query(
        "UPDATE avatar_history SET is_current = FALSE WHERE user_id = $1 AND is_current = TRUE",
    )
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Убираем ссылку из users
    sqlx::query("UPDATE users SET avatar_id = NULL WHERE id = $1")
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    let user = get_user_dto(&state, auth.user_id).await?;
    broadcast_user_update(&state, auth.user_id, user).await;

    Ok(Json(()))
}

/// DELETE /api/users/me/avatars/:avatar_id — удалить аватарку из истории навсегда
pub async fn delete_avatar_history(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(avatar_id): Path<Uuid>,
) -> Result<Json<()>, AppError> {
    // Находим запись в истории
    type HistoryRow = (Uuid, bool);
    let row: Option<HistoryRow> = sqlx::query_as(
        "SELECT attachment_id, is_current FROM avatar_history WHERE id = $1 AND user_id = $2",
    )
    .bind(avatar_id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;

    let (attachment_id, was_current) =
        row.ok_or_else(|| AppError::NotFound("Аватарка не найдена".into()))?;

    // Если это текущая — убираем ссылку из users
    if was_current {
        sqlx::query("UPDATE users SET avatar_id = NULL WHERE id = $1")
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    // Удаляем запись из истории
    sqlx::query("DELETE FROM avatar_history WHERE id = $1")
        .bind(avatar_id)
        .execute(&state.db)
        .await?;

    // Удаляем attachment
    sqlx::query("DELETE FROM attachments WHERE id = $1")
        .bind(attachment_id)
        .execute(&state.db)
        .await?;

    // Удаляем файл с диска
    let file_path = format!("{}/{}", state.config.upload_dir, attachment_id);
    let _ = tokio::fs::remove_file(&file_path).await;

    if was_current {
        let user = get_user_dto(&state, auth.user_id).await?;
        broadcast_user_update(&state, auth.user_id, user).await;
    }

    Ok(Json(()))
}

/// POST /api/users/me/avatars/:avatar_id/set-current — поставить старую аватарку
pub async fn set_avatar_from_history(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(avatar_id): Path<Uuid>,
) -> Result<Json<UpdateAvatarRes>, AppError> {
    // Проверяем что запись принадлежит пользователю
    type HistoryRow = (Uuid,);
    let row: Option<HistoryRow> =
        sqlx::query_as("SELECT attachment_id FROM avatar_history WHERE id = $1 AND user_id = $2")
            .bind(avatar_id)
            .bind(auth.user_id)
            .fetch_optional(&state.db)
            .await?;

    let (attachment_id,) = row.ok_or_else(|| AppError::NotFound("Аватарка не найдена".into()))?;

    // Снимаем текущую
    sqlx::query(
        "UPDATE avatar_history SET is_current = FALSE WHERE user_id = $1 AND is_current = TRUE",
    )
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;

    // Ставим выбранную как текущую
    sqlx::query("UPDATE avatar_history SET is_current = TRUE WHERE id = $1")
        .bind(avatar_id)
        .execute(&state.db)
        .await?;

    // Обновляем пользователя
    sqlx::query("UPDATE users SET avatar_id = $1 WHERE id = $2")
        .bind(attachment_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;

    let avatar_url = format!("/api/files/{}", attachment_id);

    let user = get_user_dto(&state, auth.user_id).await?;
    broadcast_user_update(&state, auth.user_id, user).await;

    Ok(Json(UpdateAvatarRes { avatar_url }))
}

/// GET /api/users/:user_id/avatar
pub async fn get_avatar(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let row: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT a.id, a.mime_type FROM users u
         JOIN attachments a ON a.id = u.avatar_id
         WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (avatar_id, mime) = row.ok_or_else(|| AppError::NotFound("Аватарка не найдена".into()))?;

    let path = format!("{}/{}", state.config.upload_dir, avatar_id);
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::NotFound(format!("Файл не найден: {e}")))?;

    Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(data))
        .map_err(|e| AppError::Internal(format!("response: {e}")))
}

// ═══════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════

fn get_extension(mime: &str) -> &str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "bin",
    }
}

fn validate_public_keys(keys: &PublicKeyBundle) -> Result<(), AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let identity = STANDARD
        .decode(&keys.identity_key)
        .map_err(|_| AppError::BadRequest("Невалидный identity_key base64".into()))?;

    if identity.is_empty() || identity.len() > 200 {
        return Err(AppError::BadRequest(
            "identity_key: невалидная длина".into(),
        ));
    }

    if keys.signing_key != "NA" {
        let signing = STANDARD
            .decode(&keys.signing_key)
            .map_err(|_| AppError::BadRequest("Невалидный signing_key base64".into()))?;
        if signing.is_empty() || signing.len() > 200 {
            return Err(AppError::BadRequest("signing_key: невалидная длина".into()));
        }
    }

    if keys.signature != "NA" {
        STANDARD
            .decode(&keys.signature)
            .map_err(|_| AppError::BadRequest("Невалидная signature base64".into()))?;
    }

    if keys.key_id.is_empty() || keys.key_id.len() > 64 {
        return Err(AppError::BadRequest("key_id: 1-64 символов".into()));
    }

    Ok(())
}

pub async fn get_user_dto(state: &AppState, user_id: Uuid) -> Result<UserDto, AppError> {
    let user: models::User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;

    let avatar_url = user.avatar_id.map(|id| format!("/api/files/{}", id));

    let public_keys = if user.identity_key.is_some() {
        Some(PublicKeyBundle {
            identity_key: user.identity_key.unwrap_or_default(),
            signing_key: user.signing_key.unwrap_or_default(),
            signature: user.key_signature.unwrap_or_default(),
            key_id: user.key_id.unwrap_or_default(),
        })
    } else {
        None
    };

    Ok(UserDto {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        online: state.is_online(&user.id).await,
        last_seen: user.last_seen,
        avatar_url,
        public_keys,
    })
}

async fn broadcast_user_update(state: &AppState, user_id: Uuid, user: UserDto) {
    use shared::WsServerMsg;

    let contacts: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT DISTINCT cm2.user_id FROM chat_members cm1
         JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id AND cm2.user_id != $1
         WHERE cm1.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let msg = WsServerMsg::UserUpdated { user };

    for (uid,) in contacts {
        state.send_to_user(&uid, msg.clone()).await;
    }
}
