use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use shared::UserDto;

use crate::{api::AuthUser, error::AppError, models, state::AppState};

#[derive(Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

/// GET /api/users?q=...
pub async fn search(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<UserDto>>, AppError> {
    let users: Vec<models::User> = if let Some(ref q) = params.q {
        let pattern = format!("%{}%", q.to_lowercase());
        sqlx::query_as(
            "SELECT * FROM users
             WHERE (LOWER(username) LIKE $1 OR LOWER(display_name) LIKE $1)
               AND id != $2
             ORDER BY username LIMIT 50",
        )
        .bind(&pattern)
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM users WHERE id != $1 ORDER BY username LIMIT 50",
        )
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?
    };

    let mut out = Vec::with_capacity(users.len());
    for u in users {
        out.push(UserDto {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            online: state.is_online(&u.id).await,
            last_seen: u.last_seen,
        });
    }
    Ok(Json(out))
}