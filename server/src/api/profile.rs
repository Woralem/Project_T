// server/src/api/profile.rs

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::header,
    response::Response,
    Json,
};
use shared::{PublicKeyBundle, UpdateAvatarRes, UpdateProfileReq, UserDto};
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, models, state::AppState};

const MAX_AVATAR_SIZE: usize = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];

/// PUT /api/users/me
pub async fn update_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateProfileReq>,
) -> Result<Json<UserDto>, AppError> {
    // Обновляем display_name если передан
    if let Some(ref name) = req.display_name {
        if name.is_empty() || name.len() > 64 {
            return Err(AppError::BadRequest("display_name: 1-64 символов".into()));
        }
        sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
            .bind(name)
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    // Обновляем публичные ключи если переданы
    if let Some(ref keys) = req.public_keys {
        // Валидация ключей
        validate_public_keys(keys)?;

        sqlx::query(
            "UPDATE users SET identity_key = $1, signing_key = $2, key_signature = $3, key_id = $4 WHERE id = $5"
        )
        .bind(&keys.identity_key)
        .bind(&keys.signing_key)
        .bind(&keys.signature)
        .bind(&keys.key_id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    }

    // Возвращаем обновлённый профиль
    get_user_dto(&state, auth.user_id).await.map(Json)
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

        // Проверяем тип файла
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

        // Удаляем старую аватарку если есть
        let old_avatar: Option<(Uuid,)> =
            sqlx::query_as("SELECT avatar_id FROM users WHERE id = $1")
                .bind(auth.user_id)
                .fetch_optional(&state.db)
                .await?;

        if let Some((old_id,)) = old_avatar {
            // Удаляем файл
            let old_path = format!("{}/{}", state.config.upload_dir, old_id);
            let _ = tokio::fs::remove_file(&old_path).await;
            // Удаляем запись
            sqlx::query("DELETE FROM attachments WHERE id = $1")
                .bind(old_id)
                .execute(&state.db)
                .await?;
        }

        // Создаём новую аватарку
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

        let avatar_url = format!("/api/files/{}", att_id);

        tracing::info!(user_id = %auth.user_id, %att_id, "avatar uploaded");

        // Уведомляем контакты об обновлении профиля
        let user = get_user_dto(&state, auth.user_id).await?;
        broadcast_user_update(&state, auth.user_id, user.clone()).await;

        return Ok(Json(UpdateAvatarRes { avatar_url }));
    }

    Err(AppError::BadRequest(
        "Не найден файл avatar в запросе".into(),
    ))
}

/// DELETE /api/users/me/avatar
pub async fn delete_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<()>, AppError> {
    let avatar: Option<(Uuid,)> = sqlx::query_as("SELECT avatar_id FROM users WHERE id = $1")
        .bind(auth.user_id)
        .fetch_optional(&state.db)
        .await?;

    if let Some((avatar_id,)) = avatar {
        // Удаляем файл
        let path = format!("{}/{}", state.config.upload_dir, avatar_id);
        let _ = tokio::fs::remove_file(&path).await;

        // Удаляем запись аттачмента
        sqlx::query("DELETE FROM attachments WHERE id = $1")
            .bind(avatar_id)
            .execute(&state.db)
            .await?;

        // Очищаем avatar_id пользователя
        sqlx::query("UPDATE users SET avatar_id = NULL WHERE id = $1")
            .bind(auth.user_id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(()))
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
        .header(header::CACHE_CONTROL, "public, max-age=86400") // 24 часа кэш
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
    // Проверяем что все поля заполнены и валидный base64
    use base64::{engine::general_purpose::STANDARD, Engine};

    let identity = STANDARD
        .decode(&keys.identity_key)
        .map_err(|_| AppError::BadRequest("Невалидный identity_key".into()))?;

    let signing = STANDARD
        .decode(&keys.signing_key)
        .map_err(|_| AppError::BadRequest("Невалидный signing_key".into()))?;

    STANDARD
        .decode(&keys.signature)
        .map_err(|_| AppError::BadRequest("Невалидная signature".into()))?;

    // Проверяем длину ключей (X25519 = 32 байта, Ed25519 = 32 байта)
    if identity.len() != 32 {
        return Err(AppError::BadRequest(
            "identity_key должен быть 32 байта".into(),
        ));
    }
    if signing.len() != 32 {
        return Err(AppError::BadRequest(
            "signing_key должен быть 32 байта".into(),
        ));
    }

    if keys.key_id.len() > 64 {
        return Err(AppError::BadRequest("key_id слишком длинный".into()));
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
        online: state.is_online(&user.id).await,
        last_seen: user.last_seen,
        avatar_url,
        public_keys,
    })
}

async fn broadcast_user_update(state: &AppState, user_id: Uuid, user: UserDto) {
    use shared::WsServerMsg;

    // Находим всех контактов (участников общих чатов)
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
