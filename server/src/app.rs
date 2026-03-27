use axum::http::{HeaderName, Method};
use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{api, state::AppState, ws};

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("authorization"),
        ]);

    let api = Router::new()
        .route("/auth/register", post(api::auth::register))
        .route("/auth/login", post(api::auth::login))
        .route("/auth/me", get(api::auth::me))
        .route("/users", get(api::users::search))
        .route("/chats", get(api::chats::list).post(api::chats::create))
        .route("/chats/:chat_id", get(api::chats::get))
        .route("/chats/:chat_id/messages", get(api::messages::list))
        .route(
            "/invites",
            get(api::invites::list).post(api::invites::create),
        )
        // Files
        .route("/upload", post(api::files::upload))
        .route("/files/:file_id", get(api::files::download));

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
