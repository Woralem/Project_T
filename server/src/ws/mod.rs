use axum::{
    extract::{
        ws::{Message as WsMsg, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use shared::{MessageDto, WsClientMsg, WsServerMsg};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{crypto::jwt, error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct WsParams {
    token: String,
}

/// GET /ws?token=...
pub async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(params): Query<WsParams>,
) -> Result<Response, AppError> {
    let claims = jwt::validate_token(&params.token, &state.config.jwt_secret)?;
    let user_id = claims.sub;
    let username = claims.username;

    tracing::info!(%user_id, %username, "ws connect");

    Ok(ws.on_upgrade(move |socket| run(socket, state, user_id, username)))
}

// ── Основной цикл ───────────────────────────────────────

async fn run(socket: WebSocket, state: AppState, user_id: Uuid, username: String) {
    let (mut sink, mut stream) = socket.split();

    // Канал для отправки этому юзеру
    let (tx, mut rx) = mpsc::unbounded_channel::<WsServerMsg>();
    state.register_connection(user_id, tx).await;

    // Оповестить всех что юзер онлайн
    broadcast_presence(&state, user_id, true).await;

    // Обновить last_seen
    let _ = sqlx::query("UPDATE users SET last_seen = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    // Задача: channel → WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if sink.send(WsMsg::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Задача: WebSocket → обработка
    let state2 = state.clone();
    let uname = username.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            match msg {
                WsMsg::Text(ref text) => {
                    if let Ok(parsed) = serde_json::from_str::<WsClientMsg>(text) {
                        process(&state2, user_id, &uname, parsed).await;
                    }
                }
                WsMsg::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    // ── Disconnect ────────────────────────────────────────
    state.remove_connection(&user_id).await;
    broadcast_presence(&state, user_id, false).await;

    let _ = sqlx::query("UPDATE users SET last_seen = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    tracing::info!(%user_id, "ws disconnect");
}

// ── Обработка входящих сообщений ─────────────────────────

async fn process(state: &AppState, uid: Uuid, uname: &str, msg: WsClientMsg) {
    match msg {
        WsClientMsg::SendMessage {
            chat_id,
            content,
            client_id,
        } => on_send(state, uid, uname, chat_id, content, client_id).await,

        WsClientMsg::EditMessage {
            message_id,
            new_content,
        } => on_edit(state, uid, message_id, new_content).await,

        WsClientMsg::DeleteMessage { message_id } => {
            on_delete(state, uid, message_id).await;
        }

        WsClientMsg::Typing { chat_id } => {
            broadcast_to_chat(
                state,
                chat_id,
                uid,
                WsServerMsg::Typing {
                    chat_id,
                    user_id: uid,
                },
            )
            .await;
        }

        WsClientMsg::StopTyping { chat_id } => {
            broadcast_to_chat(
                state,
                chat_id,
                uid,
                WsServerMsg::StopTyping {
                    chat_id,
                    user_id: uid,
                },
            )
            .await;
        }

        WsClientMsg::MarkRead {
            chat_id,
            message_id,
        } => {
            broadcast_to_chat(
                state,
                chat_id,
                uid,
                WsServerMsg::MessagesRead {
                    chat_id,
                    user_id: uid,
                    message_id,
                },
            )
            .await;
        }
    }
}

// ── Отправка сообщения ───────────────────────────────────

async fn on_send(
    state: &AppState,
    uid: Uuid,
    uname: &str,
    chat_id: Uuid,
    content: String,
    client_id: String,
) {
    // Проверяем членство
    let ok: Option<(i64,)> = sqlx::query_as(
        "SELECT COUNT(*) FROM chat_members WHERE chat_id=$1 AND user_id=$2",
    )
    .bind(chat_id)
    .bind(uid)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if ok.map_or(true, |r| r.0 == 0) {
        state
            .send_to_user(
                &uid,
                WsServerMsg::Error {
                    message: "не участник чата".into(),
                },
            )
            .await;
        return;
    }

    // display_name
    let display_name: String = sqlx::query_as::<_, (String,)>(
        "SELECT display_name FROM users WHERE id=$1",
    )
    .bind(uid)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|r| r.0)
    .unwrap_or_else(|| uname.to_string());

    // Сохраняем в БД
    let msg_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    if sqlx::query(
        "INSERT INTO messages (id, chat_id, sender_id, content, created_at)
         VALUES ($1,$2,$3,$4,$5)",
    )
    .bind(msg_id)
    .bind(chat_id)
    .bind(uid)
    .bind(&content)
    .bind(now)
    .execute(&state.db)
    .await
    .is_err()
    {
        state
            .send_to_user(
                &uid,
                WsServerMsg::Error {
                    message: "ошибка сохранения".into(),
                },
            )
            .await;
        return;
    }

    let dto = MessageDto {
        id: msg_id,
        chat_id,
        sender_id: uid,
        sender_name: display_name,
        content,
        edited: false,
        created_at: now,
    };

    // ACK отправителю
    state
        .send_to_user(
            &uid,
            WsServerMsg::MessageSent {
                client_id,
                message: dto.clone(),
            },
        )
        .await;

    // Остальным участникам
    broadcast_to_chat(state, chat_id, uid, WsServerMsg::NewMessage { message: dto }).await;
}

// ── Редактирование ───────────────────────────────────────

async fn on_edit(state: &AppState, uid: Uuid, msg_id: Uuid, new_text: String) {
    let row: Option<(Uuid, Uuid)> =
        sqlx::query_as("SELECT chat_id, sender_id FROM messages WHERE id=$1")
            .bind(msg_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    let Some((chat_id, sender_id)) = row else {
        return;
    };
    if sender_id != uid {
        state
            .send_to_user(
                &uid,
                WsServerMsg::Error {
                    message: "можно редактировать только свои".into(),
                },
            )
            .await;
        return;
    }

    let _ = sqlx::query("UPDATE messages SET content=$1, edited=TRUE WHERE id=$2")
        .bind(&new_text)
        .bind(msg_id)
        .execute(&state.db)
        .await;

    broadcast_to_chat_all(
        state,
        chat_id,
        WsServerMsg::MessageEdited {
            chat_id,
            message_id: msg_id,
            new_content: new_text,
        },
    )
    .await;
}

// ── Удаление ─────────────────────────────────────────────

async fn on_delete(state: &AppState, uid: Uuid, msg_id: Uuid) {
    let row: Option<(Uuid, Uuid)> =
        sqlx::query_as("SELECT chat_id, sender_id FROM messages WHERE id=$1")
            .bind(msg_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    let Some((chat_id, sender_id)) = row else {
        return;
    };
    if sender_id != uid {
        return;
    }

    let _ = sqlx::query("DELETE FROM messages WHERE id=$1")
        .bind(msg_id)
        .execute(&state.db)
        .await;

    broadcast_to_chat_all(
        state,
        chat_id,
        WsServerMsg::MessageDeleted {
            chat_id,
            message_id: msg_id,
        },
    )
    .await;
}

// ── Broadcasting ─────────────────────────────────────────

/// Отправить всем участникам чата КРОМЕ exclude
async fn broadcast_to_chat(state: &AppState, chat_id: Uuid, exclude: Uuid, msg: WsServerMsg) {
    let members: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id!=$2",
    )
    .bind(chat_id)
    .bind(exclude)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    for (uid,) in members {
        state.send_to_user(&uid, msg.clone()).await;
    }
}

/// Отправить ВСЕМ участникам чата (включая автора)
async fn broadcast_to_chat_all(state: &AppState, chat_id: Uuid, msg: WsServerMsg) {
    let members: Vec<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM chat_members WHERE chat_id=$1")
            .bind(chat_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    for (uid,) in members {
        state.send_to_user(&uid, msg.clone()).await;
    }
}

/// Уведомить все контакты юзера (кто с ним в одном чате) об online/offline
async fn broadcast_presence(state: &AppState, user_id: Uuid, online: bool) {
    let contacts: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT DISTINCT cm2.user_id
         FROM chat_members cm1
         JOIN chat_members cm2 ON cm2.chat_id = cm1.chat_id AND cm2.user_id != $1
         WHERE cm1.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let msg = if online {
        WsServerMsg::UserOnline { user_id }
    } else {
        WsServerMsg::UserOffline { user_id }
    };

    for (uid,) in contacts {
        state.send_to_user(&uid, msg.clone()).await;
    }
}