import type { AuthRes, ChatDto, MessageDto, UserDto, InviteDto, PublicKeyBundle, AttachmentDto, EncryptedChatKey, UserProfileDto, AvatarHistoryDto } from './types';

const SERVER_URL = 'http://163.5.180.138:3000';
const API_URL = `${SERVER_URL}/api`;
export const WS_URL = 'ws://163.5.180.138:3000/ws';
export { SERVER_URL };

let token: string | null = localStorage.getItem('auth_token');

export function getToken(): string | null { return token; }
export function setToken(t: string | null) { token = t; if (t) localStorage.setItem('auth_token', t); else localStorage.removeItem('auth_token'); }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${path}`, { ...options, headers });
    if (!res.ok) { const body = await res.json().catch(() => ({ error: res.statusText })); throw new ApiError(res.status, body.error || 'Unknown error'); }
    const text = await res.text();
    if (!text) return undefined as any;
    return JSON.parse(text);
}

export class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

export async function register(username: string, password: string, display_name: string, invite_code?: string, public_keys?: PublicKeyBundle): Promise<AuthRes> {
    const data = await request<AuthRes>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, display_name, invite_code, public_keys }) });
    setToken(data.token); return data;
}
export async function login(username: string, password: string): Promise<AuthRes> {
    const data = await request<AuthRes>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setToken(data.token); return data;
}
export async function getMe(): Promise<UserDto> { return request<UserDto>('/auth/me'); }
export function logout() { setToken(null); }

export async function updateProfile(data: { display_name?: string; bio?: string; public_keys?: PublicKeyBundle }): Promise<UserDto> {
    return request<UserDto>('/users/me', { method: 'PUT', body: JSON.stringify(data) });
}
export async function getUserProfile(userId: string): Promise<UserProfileDto> { return request<UserProfileDto>(`/users/${userId}/profile`); }
export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
    const formData = new FormData(); formData.append('avatar', file);
    const headers: Record<string, string> = {}; if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/users/me/avatar`, { method: 'POST', headers, body: formData });
    if (!res.ok) { const body = await res.json().catch(() => ({ error: res.statusText })); throw new ApiError(res.status, body.error || 'Upload failed'); }
    return res.json();
}
export async function deleteAvatar(): Promise<void> { await request<void>('/users/me/avatar', { method: 'DELETE' }); }
export async function deleteAvatarHistory(avatarId: string): Promise<void> { await request<void>(`/users/me/avatars/${avatarId}`, { method: 'DELETE' }); }
export async function setAvatarFromHistory(avatarId: string): Promise<{ avatar_url: string }> { return request<{ avatar_url: string }>(`/users/me/avatars/${avatarId}/set-current`, { method: 'POST' }); }
export function getAvatarUrl(userId: string): string { return `${API_URL}/users/${userId}/avatar`; }
export async function searchUsers(query?: string): Promise<UserDto[]> { const q = query ? `?q=${encodeURIComponent(query)}` : ''; return request<UserDto[]>(`/users${q}`); }
export async function getChats(): Promise<ChatDto[]> { return request<ChatDto[]>('/chats'); }
export async function getChat(chatId: string): Promise<ChatDto> { return request<ChatDto>(`/chats/${chatId}`); }
export async function createChat(member_ids: string[], is_group: boolean = false, name?: string): Promise<ChatDto> {
    return request<ChatDto>('/chats', { method: 'POST', body: JSON.stringify({ member_ids, is_group, name }) });
}
export async function deleteChat(chatId: string): Promise<void> { await request<void>(`/chats/${chatId}`, { method: 'DELETE' }); }
export async function leaveChat(chatId: string): Promise<void> { await request<void>(`/chats/${chatId}/leave`, { method: 'POST' }); }
export async function updateChatKeys(chatId: string, encrypted_keys: Record<string, EncryptedChatKey>): Promise<void> {
    await request<void>(`/chats/${chatId}/keys`, { method: 'PUT', body: JSON.stringify({ encrypted_keys }) });
}
export async function getMessages(chatId: string, limit: number = 50, before?: string): Promise<MessageDto[]> {
    let url = `/chats/${chatId}/messages?limit=${limit}`; if (before) url += `&before=${before}`; return request<MessageDto[]>(url);
}
export async function createInvite(expires_in_hours?: number): Promise<InviteDto> { return request<InviteDto>('/invites', { method: 'POST', body: JSON.stringify({ expires_in_hours }) }); }
export async function getInvites(): Promise<InviteDto[]> { return request<InviteDto[]>('/invites'); }
export function getFileUrl(fileId: string): string { return `${API_URL}/files/${fileId}`; }
export async function uploadFile(file: Blob, filename: string): Promise<AttachmentDto> {
    const formData = new FormData(); formData.append('file', file, filename);
    const headers: Record<string, string> = {}; if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/upload`, { method: 'POST', headers, body: formData });
    if (!res.ok) { const body = await res.json().catch(() => ({ error: res.statusText })); throw new ApiError(res.status, body.error || 'Upload failed'); }
    return res.json();
}