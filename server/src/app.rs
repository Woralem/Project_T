use axum::{routing::get, Router};

pub fn create_app() -> Router {
    Router::new().route("/health", get(health))
}

async fn health() -> &'static str {
    "ok"
}
