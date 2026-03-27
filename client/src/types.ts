// ═══════════════════════════════════════════════════════════
//  Серверные типы
// ═══════════════════════════════════════════════════════════

export interface UserDto {
    id: string;
    username: string;
    display_name: string;
    online: boolean;
    last_seen: string;
}

export interface MessageDto {
    id: string;
    chat_id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    edited: boolean;
    created_at: string;
}

export interface ChatMemberDto {
    user_id: string;
    username: string;
    display_name: string;
    role: string;
    online: boolean;
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
    | { type: 'message_edited'; payload: { chat_id: string; message_id: string; new_content: string } }
    | { type: 'message_deleted'; payload: { chat_id: string; message_id: string } }
    | { type: 'typing'; payload: { chat_id: string; user_id: string } }
    | { type: 'stop_typing'; payload: { chat_id: string; user_id: string } }
    | { type: 'messages_read'; payload: { chat_id: string; user_id: string; message_id: string } }
    | { type: 'user_online'; payload: { user_id: string } }
    | { type: 'user_offline'; payload: { user_id: string } }
    | { type: 'error'; payload: { message: string } };

export type WsClientMsg =
    | { type: 'send_message'; payload: { chat_id: string; content: string; client_id: string } }
    | { type: 'edit_message'; payload: { message_id: string; new_content: string } }
    | { type: 'delete_message'; payload: { message_id: string } }
    | { type: 'typing'; payload: { chat_id: string } }
    | { type: 'stop_typing'; payload: { chat_id: string } }
    | { type: 'mark_read'; payload: { chat_id: string; message_id: string } };

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
}

export interface LocalChat {
    id: string;
    is_group: boolean;
    name: string;
    members: ChatMemberDto[];
    messages: LocalMessage[];
    messagesLoaded: boolean;           // ← НОВОЕ: загружены ли сообщения
    unread_count: number;
    online: boolean;
    created_at: string;
    // Превью для списка чатов (до загрузки сообщений)
    lastMessageText: string;           // ← НОВОЕ
    lastMessageTime: string;           // ← НОВОЕ
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