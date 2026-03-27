use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════
//  E2E Encryption types
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
    pub sender_key_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PublicKeyBundle {
    pub identity_key: String,
    pub signing_key: String,
    pub signature: String,
    pub key_id: String,
}

// ═══════════════════════════════════════════════════════════
//  WS: клиент → сервер
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsClientMsg {
    SendMessage {
        chat_id: Uuid,
        content: String,
        client_id: String,
        #[serde(default)]
        attachment_id: Option<Uuid>,
        #[serde(default)]
        encrypted: Option<EncryptedPayload>,
    },
    EditMessage {
        message_id: Uuid,
        new_content: String,
        #[serde(default)]
        encrypted: Option<EncryptedPayload>,
    },
    DeleteMessage {
        message_id: Uuid,
    },
    Typing {
        chat_id: Uuid,
    },
    StopTyping {
        chat_id: Uuid,
    },
    MarkRead {
        chat_id: Uuid,
        message_id: Uuid,
    },
}

// ═══════════════════════════════════════════════════════════
//  WS: сервер → клиент
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsServerMsg {
    NewMessage {
        message: MessageDto,
    },
    MessageSent {
        client_id: String,
        message: MessageDto,
    },
    MessageEdited {
        chat_id: Uuid,
        message_id: Uuid,
        new_content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted: Option<EncryptedPayload>,
    },
    MessageDeleted {
        chat_id: Uuid,
        message_id: Uuid,
    },
    Typing {
        chat_id: Uuid,
        user_id: Uuid,
    },
    StopTyping {
        chat_id: Uuid,
        user_id: Uuid,
    },
    MessagesRead {
        chat_id: Uuid,
        user_id: Uuid,
        message_id: Uuid,
    },
    UserOnline {
        user_id: Uuid,
    },
    UserOffline {
        user_id: Uuid,
    },
    UserUpdated {
        user: UserDto,
    },
    Error {
        message: String,
    },
}

// ═══════════════════════════════════════════════════════════
//  DTOs
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AttachmentDto {
    pub id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MessageDto {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub content: String,
    pub edited: bool,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment: Option<AttachmentDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted: Option<EncryptedPayload>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub online: bool,
    pub last_seen: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatDto {
    pub id: Uuid,
    pub is_group: bool,
    pub name: Option<String>,
    pub members: Vec<ChatMemberDto>,
    pub last_message: Option<MessageDto>,
    pub unread_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMemberDto {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InviteDto {
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub used: bool,
}

#[derive(Debug, Deserialize)]
pub struct RegisterReq {
    pub username: String,
    pub password: String,
    pub display_name: String,
    pub invite_code: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Deserialize)]
pub struct LoginReq {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthRes {
    pub token: String,
    pub user: UserDto,
}

#[derive(Debug, Deserialize)]
pub struct CreateChatReq {
    pub is_group: bool,
    pub name: Option<String>,
    pub member_ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteReq {
    pub expires_in_hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileReq {
    pub display_name: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAvatarRes {
    pub avatar_url: String,
}
