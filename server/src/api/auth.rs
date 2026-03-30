use axum::{extract::State, Json};
use chrono::Utc;
use shared::{AuthRes, LoginReq, PublicKeyBundle, RegisterReq, UserDto};
use uuid::Uuid;

use crate::{
    api::AuthUser,
    crypto::{jwt, password},
    error::AppError,
    models,
    state::AppState,
};

/// POST /api/auth/register
pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterReq>,
) -> Result<Json<AuthRes>, AppError> {
    if req.username.len() < 3 || req.username.len() > 32 {
        return Err(AppError::BadRequest("username: 3‑32 символов".into()));
    }
    if req.password.len() < 6 {
        return Err(AppError::BadRequest("пароль: минимум 6 символов".into()));
    }
    if req.display_name.is_empty() || req.display_name.len() > 64 {
        return Err(AppError::BadRequest("display_name: 1‑64 символов".into()));
    }

    let (user_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    if user_count > 0 {
        let code = req
            .invite_code
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("нужен инвайт‑код".into()))?;

        let inv: Option<models::Invite> = sqlx::query_as("SELECT * FROM invites WHERE code = $1")
            .bind(code)
            .fetch_optional(&state.db)
            .await?;

        let inv = inv.ok_or_else(|| AppError::BadRequest("неверный инвайт‑код".into()))?;

        if inv.used {
            return Err(AppError::BadRequest("инвайт уже использован".into()));
        }
        if inv.expires_at.map_or(false, |exp| exp < Utc::now()) {
            return Err(AppError::BadRequest("инвайт истёк".into()));
        }
    }

    let (exists,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_one(&state.db)
        .await?;

    if exists > 0 {
        return Err(AppError::Conflict("username уже занят".into()));
    }

    let user_id = Uuid::new_v4();
    let hash = password::hash(&req.password)?;
    let now = Utc::now();

    if let Some(ref keys) = req.public_keys {
        sqlx::query(
            "INSERT INTO users (id, username, display_name, password_hash, created_at, last_seen,
                                identity_key, signing_key, key_signature, key_id)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9)",
        )
        .bind(user_id)
        .bind(&req.username)
        .bind(&req.display_name)
        .bind(&hash)
        .bind(now)
        .bind(&keys.identity_key)
        .bind(&keys.signing_key)
        .bind(&keys.signature)
        .bind(&keys.key_id)
        .execute(&state.db)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO users (id, username, display_name, password_hash, created_at, last_seen)
             VALUES ($1, $2, $3, $4, $5, $5)",
        )
        .bind(user_id)
        .bind(&req.username)
        .bind(&req.display_name)
        .bind(&hash)
        .bind(now)
        .execute(&state.db)
        .await?;
    }

    if let Some(code) = &req.invite_code {
        sqlx::query("UPDATE invites SET used = TRUE, used_by = $1 WHERE code = $2")
            .bind(user_id)
            .bind(code)
            .execute(&state.db)
            .await?;
    }

    let token = jwt::create_token(
        user_id,
        &req.username,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )?;

    let public_keys = req.public_keys.as_ref().map(|k| PublicKeyBundle {
        identity_key: k.identity_key.clone(),
        signing_key: k.signing_key.clone(),
        signature: k.signature.clone(),
        key_id: k.key_id.clone(),
    });

    Ok(Json(AuthRes {
        token,
        user: UserDto {
            id: user_id,
            username: req.username,
            display_name: req.display_name,
            bio: String::new(),
            online: true,
            last_seen: now,
            avatar_url: None,
            public_keys,
        },
    }))
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginReq>,
) -> Result<Json<AuthRes>, AppError> {
    let user: models::User = sqlx::query_as("SELECT * FROM users WHERE username = $1")
        .bind(&req.username)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::Unauthorized("неверные данные".into()))?;

    if !password::verify(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("неверные данные".into()));
    }

    sqlx::query("UPDATE users SET last_seen = NOW() WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    let token = jwt::create_token(
        user.id,
        &user.username,
        &state.config.jwt_secret,
        state.config.jwt_expiry_hours,
    )?;

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

    Ok(Json(AuthRes {
        token,
        user: UserDto {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            bio: user.bio,
            online: true,
            last_seen: Utc::now(),
            avatar_url,
            public_keys,
        },
    }))
}

/// GET /api/auth/me
pub async fn me(State(state): State<AppState>, auth: AuthUser) -> Result<Json<UserDto>, AppError> {
    let user: models::User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(auth.user_id)
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

    Ok(Json(UserDto {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        online: state.is_online(&user.id).await,
        last_seen: user.last_seen,
        avatar_url,
        public_keys,
    }))
}
