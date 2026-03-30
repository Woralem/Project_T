use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
pub struct PublicKeyBundle {
    pub identity_key: String,
    pub signing_key: String,
    pub signature: String,
    pub key_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub online: bool,
    pub last_seen: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserProfileDto {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub online: bool,
    pub last_seen: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub avatars: Vec<AvatarHistoryDto>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_keys: Option<PublicKeyBundle>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AvatarHistoryDto {
    pub id: Uuid,
    pub url: String,
    pub set_at: DateTime<Utc>,
    pub is_current: bool,
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

// ═══════════════════════════════════════════════════════════
//  Encryption
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: String,
    pub nonce: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_key_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedChatKey {
    pub ephemeral_pub: String,
    pub ciphertext: String,
    pub nonce: String,
}

// ═══════════════════════════════════════════════════════════
//  Attachments
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentDto {
    pub id: Uuid,
    pub filename: String,
    pub mime_type: String,
    pub size_bytes: i64,
}

// ═══════════════════════════════════════════════════════════
//  Messages
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyInfoDto {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub sender_name: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment: Option<AttachmentDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted: Option<EncryptedPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForwardInfoDto {
    pub original_message_id: Uuid,
    pub original_sender_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_chat_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<Box<ReplyInfoDto>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forwarded_from: Option<ForwardInfoDto>,
}

// ═══════════════════════════════════════════════════════════
//  Chats
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_chat_key: Option<EncryptedChatKey>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member_key_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatDto {
    pub id: Uuid,
    pub is_group: bool,
    pub name: Option<String>,
    pub members: Vec<ChatMemberDto>,
    pub last_message: Option<MessageDto>,
    pub unread_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateChatReq {
    pub member_ids: Vec<Uuid>,
    pub is_group: bool,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateChatKeysReq {
    pub encrypted_keys: HashMap<Uuid, EncryptedChatKey>,
}

// ═══════════════════════════════════════════════════════════
//  Invites
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct InviteDto {
    pub code: String,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    pub used: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateInviteReq {
    pub expires_in_hours: Option<i64>,
}

// ═══════════════════════════════════════════════════════════
//  WebSocket
// ═══════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsServerMsg {
    #[serde(rename = "new_message")]
    NewMessage { message: MessageDto },

    #[serde(rename = "message_sent")]
    MessageSent {
        client_id: String,
        message: MessageDto,
    },

    #[serde(rename = "message_edited")]
    MessageEdited {
        chat_id: Uuid,
        message_id: Uuid,
        new_content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        encrypted: Option<EncryptedPayload>,
    },

    #[serde(rename = "message_deleted")]
    MessageDeleted { chat_id: Uuid, message_id: Uuid },

    #[serde(rename = "typing")]
    Typing { chat_id: Uuid, user_id: Uuid },

    #[serde(rename = "stop_typing")]
    StopTyping { chat_id: Uuid, user_id: Uuid },

    #[serde(rename = "messages_read")]
    MessagesRead {
        chat_id: Uuid,
        user_id: Uuid,
        message_id: Uuid,
    },

    #[serde(rename = "user_online")]
    UserOnline { user_id: Uuid },

    #[serde(rename = "user_offline")]
    UserOffline { user_id: Uuid },

    #[serde(rename = "user_updated")]
    UserUpdated { user: UserDto },

    #[serde(rename = "error")]
    Error { message: String },

    // Call
    #[serde(rename = "call_incoming")]
    CallIncoming {
        chat_id: Uuid,
        call_id: String,
        caller_id: Uuid,
        caller_name: String,
        sdp: String,
        encrypted: bool,
    },
    #[serde(rename = "call_accepted")]
    CallAccepted {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    #[serde(rename = "call_ice")]
    CallIce {
        chat_id: Uuid,
        call_id: String,
        candidate: String,
        encrypted: bool,
    },
    #[serde(rename = "call_rejected")]
    CallRejected { chat_id: Uuid, call_id: String },
    #[serde(rename = "call_ended")]
    CallEnded { chat_id: Uuid, call_id: String },
    #[serde(rename = "call_mute_changed")]
    CallMuteChanged {
        chat_id: Uuid,
        call_id: String,
        user_id: Uuid,
        muted: bool,
    },
    #[serde(rename = "call_media_shared")]
    CallMediaShared {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        user_id: Uuid,
        user_name: String,
        file_id: String,
        file_name: String,
    },
    #[serde(rename = "call_media_removed")]
    CallMediaRemoved {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
    },
    #[serde(rename = "call_media_controlled")]
    CallMediaControlled {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        user_id: Uuid,
        action: String,
        current_time: f64,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsClientMsg {
    #[serde(rename = "send_message")]
    SendMessage {
        chat_id: Uuid,
        content: String,
        client_id: String,
        #[serde(default)]
        attachment_id: Option<Uuid>,
        #[serde(default)]
        encrypted: Option<EncryptedPayload>,
        #[serde(default)]
        reply_to_id: Option<Uuid>,
        #[serde(default)]
        forwarded_from_id: Option<Uuid>,
        #[serde(default)]
        forwarded_from_name: Option<String>,
    },

    #[serde(rename = "edit_message")]
    EditMessage {
        message_id: Uuid,
        new_content: String,
        #[serde(default)]
        encrypted: Option<EncryptedPayload>,
    },

    #[serde(rename = "delete_message")]
    DeleteMessage { message_id: Uuid },

    #[serde(rename = "typing")]
    Typing { chat_id: Uuid },

    #[serde(rename = "stop_typing")]
    StopTyping { chat_id: Uuid },

    #[serde(rename = "mark_read")]
    MarkRead { chat_id: Uuid, message_id: Uuid },

    // Call
    #[serde(rename = "call_offer")]
    CallOffer {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    #[serde(rename = "call_answer")]
    CallAnswer {
        chat_id: Uuid,
        call_id: String,
        sdp: String,
        encrypted: bool,
    },
    #[serde(rename = "call_ice")]
    CallIce {
        chat_id: Uuid,
        call_id: String,
        candidate: String,
        encrypted: bool,
    },
    #[serde(rename = "call_reject")]
    CallReject { chat_id: Uuid, call_id: String },
    #[serde(rename = "call_mute")]
    CallMute {
        chat_id: Uuid,
        call_id: String,
        muted: bool,
    },
    #[serde(rename = "call_hangup")]
    CallHangup { chat_id: Uuid, call_id: String },
    #[serde(rename = "call_media_share")]
    CallMediaShare {
        chat_id: Uuid,
        call_id: String,
        file_id: String,
        file_name: String,
    },
    #[serde(rename = "call_media_remove")]
    CallMediaRemove {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
    },
    #[serde(rename = "call_media_control")]
    CallMediaControl {
        chat_id: Uuid,
        call_id: String,
        media_id: String,
        action: String,
        current_time: f64,
    },
}
