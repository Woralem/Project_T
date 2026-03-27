mod app;
mod config;
mod db;
mod error;
mod state;

mod api;
mod crypto;
mod models;
mod ws;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    init_tracing();

    let config = config::Config::from_env();

    // Создаём директорию для файлов
    tokio::fs::create_dir_all(&config.upload_dir)
        .await
        .expect("failed to create upload dir");

    let pool = db::connect(&config.database_url).await;
    db::run_migrations(&pool).await;
    tracing::info!("database connected, migrations applied");

    let state = state::AppState::new(pool, config.clone());
    let app = app::create_app(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_addr)
        .await
        .expect("failed to bind");

    tracing::info!(addr = %config.bind_addr, "server starting");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

fn init_tracing() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info,server=debug".into());

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.ok();
    tracing::info!("shutdown signal received");
}
