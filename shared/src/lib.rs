use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ═══════════════════════════════════════════════════════════
//  Auth
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct RegisterReq {
    pub username: String,
    pub password: String,
    pub display_name: String,
    pub invite_code: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginReq {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthRes {
    pub token: String,
    pub user: UserDto,
}

// ═══════════════════════════════════════════════════════════
//  Users
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub online: bool,
    pub last_seen: DateTime<Utc>,
    pub avatar_url: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicKeyBundle {
    pub identity_key: String,
    pub signing_key: String,
    pub signature: String,
    pub key_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateProfileReq {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAvatarRes {
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvatarHistoryDto {
    pub id: Uuid,
    pub url: String,
    pub set_at: DateTime<Utc>,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfileDto {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub online: bool,
    pub last_seen: DateTime<Utc>,
    pub avatar_url: Option<String>,
    pub avatars: Vec<AvatarHistoryDto>,
    pub created_at: DateTime<Utc>,
    pub public_keys: Option<PublicKeyBundle>,
}

// ═══════════════════════════════════════════════════════════
//  Chats
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateChatReq {
    pub member_ids: Vec<Uuid>,
    pub is_group: bool,
    pub name: Option<String>,
    pub is_channel: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDto {
    pub id: Uuid,
    pub is_group: bool,
    pub is_channel: bool,
    pub name: Option<String>,
    pub members: Vec<ChatMemberDto>,
    pub last_message: Option<MessageDto>,
    pub unread_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMemberDto {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub online: bool,
    pub avatar_url: Option<String>,
    pub public_keys: Option<PublicKeyBundle>,
    pub encrypted_chat_key: Option<EncryptedChatKey>,
    pub member_key_id: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatInviteDto {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub max_uses: Option<i32>,
    pub use_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateChatInviteReq {
    pub expires_in_hours: Option<i64>,
    pub max_uses: Option<i32>,
}

// ═══════════════════════════════════════════════════════════
//  Messages
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDto {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub content: String,
    pub edited: bool,
    pub created_at: DateTime<Utc>,
    pub attachment: Option<AttachmentDto>,
    pub encrypted: Option<EncryptedPayload>,
    pub reply_to: Option<Box<ReplyInfoDto>>,
    pub forwarded_from: Option<ForwardInfoDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentDto {
    pub id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyInfoDto {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub content: String,
    pub attachment: Option<AttachmentDto>,
    pub encrypted: Option<EncryptedPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardInfoDto {
    pub original_message_id: Uuid,
    pub original_sender_name: String,
    pub original_chat_name: Option<String>,
}

// ═══════════════════════════════════════════════════════════
//  E2E Encryption
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_nonce: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedChatKey {
    pub ephemeral_pub: String,
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateChatKeysReq {
    pub encrypted_keys: std::collections::HashMap<Uuid, EncryptedChatKey>,
}

// ═══════════════════════════════════════════════════════════
//  Invites
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateInviteReq {
    pub expires_in_hours: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InviteDto {
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub used: bool,
}

// ═══════════════════════════════════════════════════════════
//  WebSocket Messages
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
#[serde(rename_all = "snake_case")]
pub enum WsClientMsg {
    SendMessage {
        chat_id: Uuid,
        content: String,
        client_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        attachment_id: Option<Uuid>,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted: Option<EncryptedPayload>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to_id: Option<Uuid>,
        #[serde(skip_serializing_if = "Option::is_none")]
        forwarded_from_id: Option<Uuid>,
        #[serde(skip_serializing_if = "Option::is_none")]
        forwarded_from_name: Option<String>,
    },
    EditMessage {
        message_id: Uuid,
        new_content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
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
    CallOffer {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    CallAnswer {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    CallIce {
        chat_id: Uuid,
        call_id: String,
        candidate: String,
        encrypted: bool,
    },
    CallReject {
        chat_id: Uuid,
        call_id: String,
    },
    CallMute {
        chat_id: Uuid,
        call_id: String,
        muted: bool,
    },
    CallHangup {
        chat_id: Uuid,
        call_id: String,
    },
    CallMediaShare {
        chat_id: Uuid,
        call_id: String,
        file_id: String,
        file_name: String,
    },
    CallMediaRemove {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
    },
    CallMediaControl {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        action: String,
        current_time: f64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    ChatDeleted {
        chat_id: Uuid,
    },
    Error {
        message: String,
    },
    CallIncoming {
        chat_id: Uuid,
        call_id: String,
        caller_id: Uuid,
        caller_name: String,
        sdp: String,
        encrypted: bool,
    },
    CallAccepted {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    CallIce {
        chat_id: Uuid,
        call_id: String,
        candidate: String,
        encrypted: bool,
    },
    CallRejected {
        chat_id: Uuid,
        call_id: String,
    },
    CallMuteChanged {
        chat_id: Uuid,
        call_id: String,
        user_id: Uuid,
        muted: bool,
    },
    CallEnded {
        chat_id: Uuid,
        call_id: String,
    },
    CallMediaShared {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        user_id: Uuid,
        user_name: String,
        file_id: String,
        file_name: String,
    },
    CallMediaRemoved {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
    },
    CallMediaControlled {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        user_id: Uuid,
        action: String,
        current_time: f64,
    },
}
