use std::collections::HashMap;
use std::sync::Arc;

use shared::WsServerMsg;
use sqlx::PgPool;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use crate::config::Config;

/// Канал для отправки сообщений в WebSocket конкретного юзера
pub type WsTx = mpsc::UnboundedSender<WsServerMsg>;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub config: Config,
    /// user_id → WsTx (только онлайн юзеры)
    connections: Arc<RwLock<HashMap<Uuid, WsTx>>>,
}

impl AppState {
    pub fn new(db: PgPool, config: Config) -> Self {
        Self {
            db,
            config,
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_connection(&self, user_id: Uuid, tx: WsTx) {
        self.connections.write().await.insert(user_id, tx);
    }

    pub async fn remove_connection(&self, user_id: &Uuid) {
        self.connections.write().await.remove(user_id);
    }

    /// Отправить сообщение конкретному юзеру (если он онлайн)
    pub async fn send_to_user(&self, user_id: &Uuid, msg: WsServerMsg) -> bool {
        let conns = self.connections.read().await;
        if let Some(tx) = conns.get(user_id) {
            tx.send(msg).is_ok()
        } else {
            false
        }
    }

    pub async fn is_online(&self, user_id: &Uuid) -> bool {
        self.connections.read().await.contains_key(user_id)
    }
}