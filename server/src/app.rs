use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{api, state::AppState, ws};

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        // Auth
        .route("/auth/register", post(api::auth::register))
        .route("/auth/login", post(api::auth::login))
        .route("/auth/me", get(api::auth::me))
        // Users
        .route("/users", get(api::users::search))
        // Chats
        .route("/chats", get(api::chats::list))
        .route("/chats", post(api::chats::create))
        .route("/chats/{chat_id}", get(api::chats::get))
        // Messages
        .route(
            "/chats/{chat_id}/messages",
            get(api::messages::list),
        )
        // Invites
        .route("/invites", get(api::invites::list))
        .route("/invites", post(api::invites::create));

    Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws::upgrade))
        .nest("/api", api)
        .layer(cors)
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}