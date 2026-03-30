use axum::{
    extract::{
        ws::{Message as WsMsg, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use shared::{
    AttachmentDto, EncryptedPayload, ForwardInfoDto, MessageDto, ReplyInfoDto, WsClientMsg,
    WsServerMsg,
};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::{crypto::jwt, error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct WsParams {
    token: String,
}

pub async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(params): Query<WsParams>,
) -> Result<Response, AppError> {
    let claims = jwt::validate_token(&params.token, &state.config.jwt_secret)?;
    Ok(ws.on_upgrade(move |socket| run(socket, state, claims.sub, claims.username)))
}

async fn run(socket: WebSocket, state: AppState, user_id: Uuid, username: String) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<WsServerMsg>();
    state.register_connection(user_id, tx).await;

    tracing::info!(%user_id, %username, "ws connected");
    broadcast_presence(&state, user_id, true).await;

    let _ = sqlx::query("UPDATE users SET last_seen = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sink.send(WsMsg::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    let state2 = state.clone();
    let uname = username.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            match msg {
                WsMsg::Text(ref text) => match serde_json::from_str::<WsClientMsg>(text) {
                    Ok(parsed) => process(&state2, user_id, &uname, parsed).await,
                    Err(e) => {
                        tracing::warn!(%user_id, "ws parse error: {e}");
                        state2
                            .send_to_user(
                                &user_id,
                                WsServerMsg::Error {
                                    message: format!("invalid message: {e}"),
                                },
                            )
                            .await;
                    }
                },
                WsMsg::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! { _ = send_task => {}, _ = recv_task => {} }

    state.remove_connection(&user_id).await;
    broadcast_presence(&state, user_id, false).await;
    let _ = sqlx::query("UPDATE users SET last_seen = NOW() WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await;
    tracing::info!(%user_id, "ws disconnected");
}

async fn get_display_name(state: &AppState, uid: Uuid, fallback: &str) -> String {
    sqlx::query_as::<_, (String,)>("SELECT display_name FROM users WHERE id=$1")
        .bind(uid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .map(|r| r.0)
        .unwrap_or_else(|| fallback.to_string())
}

async fn process(state: &AppState, uid: Uuid, uname: &str, msg: WsClientMsg) {
    match msg {
        WsClientMsg::SendMessage {
            chat_id,
            content,
            client_id,
            attachment_id,
            encrypted,
            reply_to_id,
            forwarded_from_id,
            forwarded_from_name,
        } => {
            on_send(
                state,
                uid,
                uname,
                chat_id,
                content,
                client_id,
                attachment_id,
                encrypted,
                reply_to_id,
                forwarded_from_id,
                forwarded_from_name,
            )
            .await
        }
        WsClientMsg::EditMessage {
            message_id,
            new_content,
            encrypted,
        } => on_edit(state, uid, message_id, new_content, encrypted).await,
        WsClientMsg::DeleteMessage { message_id } => on_delete(state, uid, message_id).await,
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
            .await
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
            .await
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
            .await
        }
        // ── Звонки ──────────────────────────────────────────
        WsClientMsg::CallOffer {
            chat_id,
            call_id,
            sdp,
            encrypted,
        } => on_call_offer(state, uid, uname, chat_id, call_id, sdp, encrypted).await,
        WsClientMsg::CallAnswer {
            chat_id,
            call_id,
            sdp,
            encrypted,
        } => on_call_answer(state, uid, chat_id, call_id, sdp, encrypted).await,
        WsClientMsg::CallIce {
            chat_id,
            call_id,
            candidate,
            encrypted,
        } => on_call_ice(state, uid, chat_id, call_id, candidate, encrypted).await,
        WsClientMsg::CallReject { chat_id, call_id } => {
            on_call_reject(state, uid, chat_id, call_id).await
        }
        WsClientMsg::CallHangup { chat_id, call_id } => {
            on_call_hangup(state, uid, chat_id, call_id).await
        }
        WsClientMsg::CallMute {
            chat_id,
            call_id,
            muted,
        } => on_call_mute(state, uid, chat_id, call_id, muted).await,

        // ── Shared Media ────────────────────────────────────
        WsClientMsg::CallMediaShare {
            chat_id,
            call_id,
            file_id,
            file_name,
        } => {
            let user_name = get_display_name(state, uid, uname).await;
            let media_id = Uuid::new_v4().to_string();
            broadcast_to_chat_all(
                state,
                chat_id,
                WsServerMsg::CallMediaShared {
                    chat_id,
                    call_id,
                    media_id,
                    user_id: uid,
                    user_name,
                    file_id,
                    file_name,
                },
            )
            .await;
        }
        WsClientMsg::CallMediaRemove {
            chat_id,
            call_id,
            media_id,
        } => {
            broadcast_to_chat_all(
                state,
                chat_id,
                WsServerMsg::CallMediaRemoved {
                    chat_id,
                    call_id,
                    media_id,
                },
            )
            .await;
        }
        WsClientMsg::CallMediaControl {
            chat_id,
            call_id,
            media_id,
            action,
            current_time,
        } => {
            broadcast_to_chat(
                state,
                chat_id,
                uid,
                WsServerMsg::CallMediaControlled {
                    chat_id,
                    call_id,
                    media_id,
                    user_id: uid,
                    action,
                    current_time,
                },
            )
            .await;
        }
    }
}

async fn on_call_mute(state: &AppState, uid: Uuid, chat_id: Uuid, call_id: String, muted: bool) {
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallMuteChanged {
            chat_id,
            call_id,
            user_id: uid,
            muted,
        },
    )
    .await;
}

// ═══════════════════════════════════════════════════════════
//  Обработчики сообщений
// ═══════════════════════════════════════════════════════════

#[allow(clippy::too_many_arguments)]
async fn on_send(
    state: &AppState,
    uid: Uuid,
    uname: &str,
    chat_id: Uuid,
    content: String,
    client_id: String,
    attachment_id: Option<Uuid>,
    encrypted: Option<EncryptedPayload>,
    reply_to_id: Option<Uuid>,
    forwarded_from_id: Option<Uuid>,
    forwarded_from_name: Option<String>,
) {
    let check: Option<(i64,)> =
        sqlx::query_as("SELECT COUNT(*) FROM chat_members WHERE chat_id=$1 AND user_id=$2")
            .bind(chat_id)
            .bind(uid)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    if check.map_or(true, |r| r.0 == 0) {
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

    if content.trim().is_empty() && attachment_id.is_none() {
        state
            .send_to_user(
                &uid,
                WsServerMsg::Error {
                    message: "пустое сообщение".into(),
                },
            )
            .await;
        return;
    }

    let display_name = get_display_name(state, uid, uname).await;

    let attachment = if let Some(att_id) = attachment_id {
        let row: Option<(String, String, i64)> =
            sqlx::query_as("SELECT filename, mime_type, size_bytes FROM attachments WHERE id=$1")
                .bind(att_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();

        row.map(|(filename, mime_type, size_bytes)| AttachmentDto {
            id: att_id,
            filename,
            mime_type,
            size_bytes,
        })
    } else {
        None
    };

    let msg_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let encrypted_json = encrypted
        .as_ref()
        .and_then(|e| serde_json::to_value(e).ok());

    if sqlx::query(
        "INSERT INTO messages (id, chat_id, sender_id, content, attachment_id, created_at, encrypted_content, reply_to_id, forwarded_from_id, forwarded_from_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(msg_id)
    .bind(chat_id)
    .bind(uid)
    .bind(&content)
    .bind(attachment_id)
    .bind(now)
    .bind(&encrypted_json)
    .bind(reply_to_id)
    .bind(forwarded_from_id)
    .bind(&forwarded_from_name)
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

    // Build reply_to info
    let reply_to = if let Some(rid) = reply_to_id {
        fetch_reply_info(state, rid).await
    } else {
        None
    };

    // Build forwarded_from info
    let forwarded_from = forwarded_from_id.map(|fid| ForwardInfoDto {
        original_message_id: fid,
        original_sender_name: forwarded_from_name.clone().unwrap_or_default(),
        original_chat_name: None,
    });

    let dto = MessageDto {
        id: msg_id,
        chat_id,
        sender_id: uid,
        sender_name: display_name,
        content,
        edited: false,
        created_at: now,
        attachment,
        encrypted: encrypted.clone(),
        reply_to,
        forwarded_from,
    };

    state
        .send_to_user(
            &uid,
            WsServerMsg::MessageSent {
                client_id,
                message: dto.clone(),
            },
        )
        .await;

    let members: Vec<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id!=$2")
            .bind(chat_id)
            .bind(uid)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    for (mid,) in &members {
        state
            .send_to_user(
                mid,
                WsServerMsg::NewMessage {
                    message: dto.clone(),
                },
            )
            .await;
    }
}

/// Fetch reply info for a message
async fn fetch_reply_info(state: &AppState, reply_id: Uuid) -> Option<Box<ReplyInfoDto>> {
    type ReplyRow = (
        Uuid,
        Uuid,
        String,
        String,
        Option<serde_json::Value>,
        Option<Uuid>,
        Option<String>,
        Option<String>,
        Option<i64>,
    );

    let row: Option<ReplyRow> = sqlx::query_as(
        "SELECT m.id, m.sender_id, u.display_name, m.content, m.encrypted_content,
                a.id, a.filename, a.mime_type, a.size_bytes
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN attachments a ON a.id = m.attachment_id
         WHERE m.id = $1",
    )
    .bind(reply_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    row.map(
        |(id, sender_id, sender_name, content, enc_json, att_id, att_fn, att_mime, att_size)| {
            let attachment = att_id.map(|aid| AttachmentDto {
                id: aid,
                filename: att_fn.unwrap_or_default(),
                mime_type: att_mime.unwrap_or_default(),
                size_bytes: att_size.unwrap_or(0),
            });
            let encrypted: Option<EncryptedPayload> =
                enc_json.and_then(|v| serde_json::from_value(v).ok());
            Box::new(ReplyInfoDto {
                id,
                sender_id,
                sender_name,
                content,
                attachment,
                encrypted,
            })
        },
    )
}

async fn on_edit(
    state: &AppState,
    uid: Uuid,
    msg_id: Uuid,
    new_text: String,
    encrypted: Option<EncryptedPayload>,
) {
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

    let encrypted_json = encrypted
        .as_ref()
        .and_then(|e| serde_json::to_value(e).ok());

    let _ = sqlx::query(
        "UPDATE messages SET content=$1, edited=TRUE, encrypted_content=$3 WHERE id=$2",
    )
    .bind(&new_text)
    .bind(msg_id)
    .bind(&encrypted_json)
    .execute(&state.db)
    .await;

    broadcast_to_chat_all(
        state,
        chat_id,
        WsServerMsg::MessageEdited {
            chat_id,
            message_id: msg_id,
            new_content: new_text,
            encrypted,
        },
    )
    .await;
}

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

// ═══════════════════════════════════════════════════════════
//  Обработчики звонков — call_id теперь String
// ═══════════════════════════════════════════════════════════

async fn on_call_offer(
    state: &AppState,
    uid: Uuid,
    uname: &str,
    chat_id: Uuid,
    call_id: String,
    sdp: String,
    encrypted: bool,
) {
    let caller_name = get_display_name(state, uid, uname).await;
    tracing::info!(%uid, %chat_id, %call_id, "call_offer");
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallIncoming {
            chat_id,
            call_id,
            caller_id: uid,
            caller_name,
            sdp,
            encrypted,
        },
    )
    .await;
}

async fn on_call_answer(
    state: &AppState,
    uid: Uuid,
    chat_id: Uuid,
    call_id: String,
    sdp: String,
    encrypted: bool,
) {
    tracing::info!(%uid, %chat_id, %call_id, "call_answer");
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallAccepted {
            chat_id,
            call_id,
            sdp,
            encrypted,
        },
    )
    .await;
}

async fn on_call_ice(
    state: &AppState,
    uid: Uuid,
    chat_id: Uuid,
    call_id: String,
    candidate: String,
    encrypted: bool,
) {
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallIce {
            chat_id,
            call_id,
            candidate,
            encrypted,
        },
    )
    .await;
}

async fn on_call_reject(state: &AppState, uid: Uuid, chat_id: Uuid, call_id: String) {
    tracing::info!(%uid, %chat_id, %call_id, "call_reject");
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallRejected { chat_id, call_id },
    )
    .await;
}

async fn on_call_hangup(state: &AppState, uid: Uuid, chat_id: Uuid, call_id: String) {
    tracing::info!(%uid, %chat_id, %call_id, "call_hangup");
    broadcast_to_chat(
        state,
        chat_id,
        uid,
        WsServerMsg::CallEnded { chat_id, call_id },
    )
    .await;
}

// ═══════════════════════════════════════════════════════════
//  Утилиты рассылки
// ═══════════════════════════════════════════════════════════

async fn broadcast_to_chat(state: &AppState, chat_id: Uuid, exclude: Uuid, msg: WsServerMsg) {
    let m: Vec<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM chat_members WHERE chat_id=$1 AND user_id!=$2")
            .bind(chat_id)
            .bind(exclude)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();
    for (uid,) in m {
        state.send_to_user(&uid, msg.clone()).await;
    }
}

async fn broadcast_to_chat_all(state: &AppState, chat_id: Uuid, msg: WsServerMsg) {
    let m: Vec<(Uuid,)> = sqlx::query_as("SELECT user_id FROM chat_members WHERE chat_id=$1")
        .bind(chat_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
    for (uid,) in m {
        state.send_to_user(&uid, msg.clone()).await;
    }
}

async fn broadcast_presence(state: &AppState, user_id: Uuid, online: bool) {
    let contacts: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT DISTINCT cm2.user_id FROM chat_members cm1
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
