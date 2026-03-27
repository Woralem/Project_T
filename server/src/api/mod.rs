pub mod auth;
pub mod chats;
pub mod invites;
pub mod messages;
pub mod users;

use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use uuid::Uuid;

use crate::{crypto::jwt, error::AppError, state::AppState};

/// Extractor — достаёт текущего юзера из JWT токена в заголовке
pub struct AuthUser {
    pub user_id: Uuid,
    pub username: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    fn from_request_parts<'life0, 'life1, 'async_trait>(
        parts: &'life0 mut Parts,
        state: &'life1 AppState,
    ) -> core::pin::Pin<
        Box<
            dyn core::future::Future<Output = Result<Self, Self::Rejection>>
                + Send
                + 'async_trait,
        >,
    >
    where
        'life0: 'async_trait,
        'life1: 'async_trait,
        Self: 'async_trait,
    {
        Box::pin(async move {
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
        })
    }
}