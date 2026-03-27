pub mod auth;
pub mod chats;
pub mod files;
pub mod invites;
pub mod messages;
pub mod users;

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use uuid::Uuid;

use crate::{crypto::jwt, error::AppError, state::AppState};

pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub username: String,
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("missing authorization".into()))?;

        let token = header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Unauthorized("invalid auth format".into()))?;

        let claims = jwt::validate_token(token, &state.config.jwt_secret)?;

        Ok(Self {
            user_id: claims.sub,
            username: claims.username,
        })
    }
}
