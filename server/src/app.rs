use axum::http::{HeaderName, Method};
use axum::{
    routing::{delete, get, post, put},
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
        .route("/users/me", put(api::profile::update_profile))
        .route(
            "/users/me/avatar",
            post(api::profile::upload_avatar).delete(api::profile::delete_avatar),
        )
        .route("/users/:user_id/avatar", get(api::profile::get_avatar))
        .route("/users", get(api::users::search))
        .route("/chats", get(api::chats::list).post(api::chats::create))
        .route("/chats/:chat_id", get(api::chats::get))
        .route("/chats/:chat_id/messages", get(api::messages::list))
        .route("/chats/:chat_id/keys", put(api::chats::update_keys))
        .route(
            "/invites",
            get(api::invites::list).post(api::invites::create),
        )
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
