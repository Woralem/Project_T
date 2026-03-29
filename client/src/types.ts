// ═══════════════════════════════════════════════════════════
//  Серверные типы
// ═══════════════════════════════════════════════════════════

export interface PublicKeyBundle {
    identity_key: string;
    signing_key: string;
    signature: string;
    key_id: string;
}

export interface EncryptedPayload {
    ciphertext: string;
    nonce: string;
    sender_key_id?: string;
}

export interface EncryptedChatKey {
    ephemeral_pub: string;
    ciphertext: string;
    nonce: string;
}

export interface AttachmentDto {
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
}

export interface UserDto {
    id: string;
    username: string;
    display_name: string;
    online: boolean;
    last_seen: string;
    avatar_url?: string;
    public_keys?: PublicKeyBundle;
}

export interface MessageDto {
    id: string;
    chat_id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    edited: boolean;
    created_at: string;
    attachment?: AttachmentDto;
    encrypted?: EncryptedPayload;
}

export interface ChatMemberDto {
    user_id: string;
    username: string;
    display_name: string;
    role: string;
    online: boolean;
    avatar_url?: string;
    public_keys?: PublicKeyBundle;
    encrypted_chat_key?: EncryptedChatKey;
    member_key_id?: string;
}

export interface ChatDto {
    id: string;
    is_group: boolean;
    name: string | null;
    members: ChatMemberDto[];
    last_message: MessageDto | null;
    unread_count: number;
    created_at: string;
}

export interface InviteDto {
    code: string;
    created_at: string;
    expires_at: string | null;
    used: boolean;
}

export interface AuthRes {
    token: string;
    user: UserDto;
}

// ═══════════════════════════════════════════════════════════
//  WebSocket типы
// ═══════════════════════════════════════════════════════════

export type WsServerMsg =
    | { type: 'new_message'; payload: { message: MessageDto } }
    | { type: 'message_sent'; payload: { client_id: string; message: MessageDto } }
    | { type: 'message_edited'; payload: { chat_id: string; message_id: string; new_content: string; encrypted?: EncryptedPayload } }
    | { type: 'message_deleted'; payload: { chat_id: string; message_id: string } }
    | { type: 'typing'; payload: { chat_id: string; user_id: string } }
    | { type: 'stop_typing'; payload: { chat_id: string; user_id: string } }
    | { type: 'messages_read'; payload: { chat_id: string; user_id: string; message_id: string } }
    | { type: 'user_online'; payload: { user_id: string } }
    | { type: 'user_offline'; payload: { user_id: string } }
    | { type: 'user_updated'; payload: { user: UserDto } }
    | { type: 'error'; payload: { message: string } }
    // ── Звонки ──
    | { type: 'call_incoming'; payload: { chat_id: string; call_id: string; caller_id: string; caller_name: string; sdp: string; encrypted: boolean } }
    | { type: 'call_accepted'; payload: { chat_id: string; call_id: string; sdp: string; encrypted: boolean } }
    | { type: 'call_ice'; payload: { chat_id: string; call_id: string; candidate: string; encrypted: boolean } }
    | { type: 'call_rejected'; payload: { chat_id: string; call_id: string } }
    | { type: 'call_ended'; payload: { chat_id: string; call_id: string } };

export type WsClientMsg =
    | { type: 'send_message'; payload: { chat_id: string; content: string; client_id: string; attachment_id?: string; encrypted?: EncryptedPayload } }
    | { type: 'edit_message'; payload: { message_id: string; new_content: string; encrypted?: EncryptedPayload } }
    | { type: 'delete_message'; payload: { message_id: string } }
    | { type: 'typing'; payload: { chat_id: string } }
    | { type: 'stop_typing'; payload: { chat_id: string } }
    | { type: 'mark_read'; payload: { chat_id: string; message_id: string } }
    // ── Звонки ──
    | { type: 'call_offer'; payload: { chat_id: string; call_id: string; sdp: string; encrypted: boolean } }
    | { type: 'call_answer'; payload: { chat_id: string; call_id: string; sdp: string; encrypted: boolean } }
    | { type: 'call_ice'; payload: { chat_id: string; call_id: string; candidate: string; encrypted: boolean } }
    | { type: 'call_reject'; payload: { chat_id: string; call_id: string } }
    | { type: 'call_hangup'; payload: { chat_id: string; call_id: string } };

// ═══════════════════════════════════════════════════════════
//  Локальные UI типы
// ═══════════════════════════════════════════════════════════

export type View = 'auth' | 'main';
export type Tab = 'chats' | 'calls' | 'settings';
export type AuthTab = 'login' | 'register';

export interface LocalMessage {
    id: string;
    client_id?: string;
    chat_id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    edited: boolean;
    created_at: string;
    own: boolean;
    status: 'pending' | 'sent' | 'delivered' | 'read';
    attachment?: AttachmentDto;
    encrypted?: EncryptedPayload;
    decrypted_content?: string;
}

export interface LocalChat {
    id: string;
    is_group: boolean;
    name: string;
    members: ChatMemberDto[];
    messages: LocalMessage[];
    messagesLoaded: boolean;
    unread_count: number;
    online: boolean;
    created_at: string;
    lastMessageText: string;
    lastMessageTime: string;
}

export interface ToastData {
    id: string;
    text: string;
    type?: 'info' | 'success' | 'error';
}

export interface ContextMenuItem {
    label: string;
    icon?: JSX.Element;
    danger?: boolean;
    onClick: () => void;
}

export interface Chat {
    id: string;
    name: string;
    group: boolean;
    online: boolean;
    unread: number;
    messages: {
        id: string;
        author: string;
        text: string;
        time: string;
        own: boolean;
        status?: string;
    }[];
}

// ═══════════════════════════════════════════════════════════
//  Call типы
// ═══════════════════════════════════════════════════════════

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallEndReason = 'hangup' | 'rejected' | 'timeout' | 'error' | 'busy';

export interface CallState {
    status: CallStatus;
    chatId: string | null;
    callId: string | null;
    peerId: string | null;
    peerName: string | null;
    peerAvatarUrl?: string;
    isMuted: boolean;
    duration: number;
    isEncrypted: boolean;
    endReason?: CallEndReason;
}