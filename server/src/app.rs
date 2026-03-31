use axum::{
    extract::DefaultBodyLimit,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{api, state::AppState, ws};

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_routes = Router::new()
        // Auth
        .route("/auth/register", post(api::auth::register))
        .route("/auth/login", post(api::auth::login))
        .route("/auth/me", get(api::auth::me))
        // Users
        .route("/users", get(api::users::search))
        .route("/users/me", put(api::profile::update_profile))
        .route(
            "/users/me/avatar",
            post(api::profile::upload_avatar).delete(api::profile::delete_avatar),
        )
        .route(
            "/users/me/avatars/:avatar_id",
            delete(api::profile::delete_avatar_history),
        )
        .route(
            "/users/me/avatars/:avatar_id/set-current",
            post(api::profile::set_avatar_from_history),
        )
        .route("/users/:user_id/avatar", get(api::profile::get_avatar))
        .route("/users/:user_id/profile", get(api::profile::get_profile))
        // Chats
        .route("/chats", get(api::chats::list).post(api::chats::create))
        .route(
            "/chats/:chat_id",
            get(api::chats::get).delete(api::chats::delete_chat),
        )
        .route("/chats/:chat_id/keys", put(api::chats::update_keys))
        .route("/chats/:chat_id/messages", get(api::messages::list))
        .route("/chats/:chat_id/pin", post(api::chats::toggle_pin))
        .route(
            "/chats/:chat_id/kick/:user_id",
            post(api::chats::kick_member),
        )
        .route(
            "/chats/:chat_id/avatar",
            post(api::chats::upload_chat_avatar),
        )
        .route(
            "/chats/:chat_id/invite",
            post(api::chats::create_chat_invite),
        )
        .route(
            "/chats/:chat_id/invites",
            get(api::chats::list_chat_invites),
        )
        .route("/chats/:chat_id/leave", post(api::chats::leave_chat))
        // Join by Code
        .route("/join/:code", post(api::chats::join_by_code))
        // Files — 26MB limit
        .route("/upload", post(api::files::upload))
        .route("/files/:file_id", get(api::files::download))
        // App-level Invites
        .route(
            "/invites",
            get(api::invites::list).post(api::invites::create),
        );

    Router::new()
        .nest("/api", api_routes)
        .route("/ws", get(ws::upgrade))
        .layer(DefaultBodyLimit::max(26 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}
