import type { AuthRes, ChatDto, MessageDto, UserDto, InviteDto } from './types';

// ═══════════════════════════════════════════════════════════
//  Конфигурация
// ═══════════════════════════════════════════════════════════

const SERVER_URL = 'http://163.5.180.138:3000';
const API_URL = `${SERVER_URL}/api`;
export const WS_URL = 'ws://163.5.180.138:3000/ws';

// ═══════════════════════════════════════════════════════════
//  Token storage
// ═══════════════════════════════════════════════════════════

let token: string | null = localStorage.getItem('auth_token');

export function getToken(): string | null {
    return token;
}

export function setToken(t: string | null) {
    token = t;
    if (t) {
        localStorage.setItem('auth_token', t);
    } else {
        localStorage.removeItem('auth_token');
    }
}

// ═══════════════════════════════════════════════════════════
//  Base fetch
// ═══════════════════════════════════════════════════════════

async function request<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || 'Unknown error');
    }

    return res.json();
}

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }
}

// ═══════════════════════════════════════════════════════════
//  Auth API
// ═══════════════════════════════════════════════════════════

export async function register(
    username: string,
    password: string,
    display_name: string,
    invite_code?: string,
): Promise<AuthRes> {
    const data = await request<AuthRes>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, display_name, invite_code }),
    });
    setToken(data.token);
    return data;
}

export async function login(username: string, password: string): Promise<AuthRes> {
    const data = await request<AuthRes>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    return data;
}

export async function getMe(): Promise<UserDto> {
    return request<UserDto>('/auth/me');
}

export function logout() {
    setToken(null);
}

// ═══════════════════════════════════════════════════════════
//  Users API
// ═══════════════════════════════════════════════════════════

export async function searchUsers(query?: string): Promise<UserDto[]> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return request<UserDto[]>(`/users${q}`);
}

// ═══════════════════════════════════════════════════════════
//  Chats API
// ═══════════════════════════════════════════════════════════

export async function getChats(): Promise<ChatDto[]> {
    return request<ChatDto[]>('/chats');
}

export async function getChat(chatId: string): Promise<ChatDto> {
    return request<ChatDto>(`/chats/${chatId}`);
}

export async function createChat(
    member_ids: string[],
    is_group: boolean = false,
    name?: string,
): Promise<ChatDto> {
    return request<ChatDto>('/chats', {
        method: 'POST',
        body: JSON.stringify({ member_ids, is_group, name }),
    });
}

// ═══════════════════════════════════════════════════════════
//  Messages API
// ═══════════════════════════════════════════════════════════

export async function getMessages(
    chatId: string,
    limit: number = 50,
    before?: string,
): Promise<MessageDto[]> {
    let url = `/chats/${chatId}/messages?limit=${limit}`;
    if (before) url += `&before=${before}`;
    return request<MessageDto[]>(url);
}

// ═══════════════════════════════════════════════════════════
//  Invites API
// ═══════════════════════════════════════════════════════════

export async function createInvite(expires_in_hours?: number): Promise<InviteDto> {
    return request<InviteDto>('/invites', {
        method: 'POST',
        body: JSON.stringify({ expires_in_hours }),
    });
}

export async function getInvites(): Promise<InviteDto[]> {
    return request<InviteDto[]>('/invites');
}

// ═══════════════════════════════════════════════════════════
//  Files API
// ═══════════════════════════════════════════════════════════

export function getFileUrl(fileId: string): string {
    return `${API_URL}/files/${fileId}`;
}

export async function uploadFile(file: Blob, filename: string): Promise<AttachmentDto> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const headers: Record<string, string> = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // НЕ ставим Content-Type — браузер сам добавит с boundary

    const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, body.error || 'Upload failed');
    }

    return res.json();
}