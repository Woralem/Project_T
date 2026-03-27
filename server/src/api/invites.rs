use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use rand::Rng;
use shared::{CreateInviteReq, InviteDto};

use crate::{api::AuthUser, error::AppError, models, state::AppState};

fn gen_code() -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect()
}

/// POST /api/invites
pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateInviteReq>,
) -> Result<Json<InviteDto>, AppError> {
    let code = gen_code();
    let expires_at = req
        .expires_in_hours
        .map(|h| Utc::now() + Duration::hours(h));

    sqlx::query(
        "INSERT INTO invites (code, created_by, expires_at) VALUES ($1,$2,$3)",
    )
    .bind(&code)
    .bind(auth.user_id)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(Json(InviteDto {
        code,
        created_at: Utc::now(),
        expires_at,
        used: false,
    }))
}

/// GET /api/invites
pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<InviteDto>>, AppError> {
    let rows: Vec<models::Invite> = sqlx::query_as(
        "SELECT * FROM invites WHERE created_by = $1 ORDER BY created_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(
        rows.into_iter()
            .map(|i| InviteDto {
                code: i.code,
                created_at: i.created_at,
                expires_at: i.expires_at,
                used: i.used,
            })
            .collect(),
    ))
}