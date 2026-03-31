import { create } from 'zustand';
import type {
    LocalChat, LocalMessage, MessageDto, ChatMemberDto,
    EncryptedChatKey, EncryptedPayload, E2EStatus, WsServerMsg, ReplyInfoDto,
} from '../types';
import * as api from '../api';
import { wsManager } from '../websocket';
import { formatTime, uid } from '../utils';
import { cryptoManager } from '../crypto';

// ═══════════════════════════════════════════════════════════
//  E2E helpers
// ═══════════════════════════════════════════════════════════

async function setupChatE2E(chatId: string, members: ChatMemberDto[], currentUserId: string): Promise<E2EStatus> {
    if (!cryptoManager.hasKeys()) return 'no_identity';
    if (cryptoManager.hasChatKey(chatId)) { autoWrapMissing(chatId, members); return 'ready'; }
    if (await cryptoManager.loadChatKeyFromCache(chatId)) { autoWrapMissing(chatId, members); return 'ready'; }

    const me = members.find(m => m.user_id === currentUserId);
    if (me?.encrypted_chat_key) {
        if (me.member_key_id === cryptoManager.getKeyId()) {
            try { await cryptoManager.unwrapChatKey(chatId, me.encrypted_chat_key); autoWrapMissing(chatId, members); return 'ready'; }
            catch (e) { console.warn('[E2E] Unwrap failed:', e); }
        }
        return 'waiting';
    }

    if (members.some(m => m.user_id !== currentUserId && m.encrypted_chat_key)) {
        try {
            const fresh = await api.getChat(chatId);
            const freshMe = fresh.members.find(m => m.user_id === currentUserId);
            if (freshMe?.encrypted_chat_key && freshMe.member_key_id === cryptoManager.getKeyId()) {
                await cryptoManager.unwrapChatKey(chatId, freshMe.encrypted_chat_key);
                autoWrapMissing(chatId, fresh.members);
                return 'ready';
            }
        } catch { /* ignore */ }
        return 'waiting';
    }

    const e2eMembers = members.filter(m => m.public_keys?.identity_key);
    if (e2eMembers.length < 2) return 'peer_no_e2e';

    try {
        const chatKey = await cryptoManager.generateChatKey();
        const wrapped: Record<string, EncryptedChatKey> = {};
        for (const m of e2eMembers) wrapped[m.user_id] = await cryptoManager.wrapChatKey(chatKey, m.public_keys!.identity_key);
        await api.updateChatKeys(chatId, wrapped);
        cryptoManager.setChatKey(chatId, chatKey);
        await cryptoManager.saveChatKeyToCache(chatId, chatKey);
        return 'ready';
    } catch (e) { console.error('[E2E] Init failed:', e); return 'error'; }
}

async function autoWrapMissing(chatId: string, members: ChatMemberDto[]) {
    const chatKey = cryptoManager.getChatKey(chatId);
    if (!chatKey) return;
    const missing = members.filter(m => m.public_keys?.identity_key && (!m.encrypted_chat_key || m.member_key_id !== m.public_keys.key_id));
    if (!missing.length) return;
    try {
        const fresh = await api.getChat(chatId);
        const wrapped: Record<string, EncryptedChatKey> = {};
        for (const m of missing) {
            const fm = fresh.members.find(f => f.user_id === m.user_id);
            if (!fm?.public_keys?.identity_key) continue;
            if (fm.encrypted_chat_key && fm.member_key_id === fm.public_keys.key_id) continue;
            wrapped[fm.user_id] = await cryptoManager.wrapChatKey(chatKey, fm.public_keys.identity_key);
        }
        if (Object.keys(wrapped).length) await api.updateChatKeys(chatId, wrapped);
    } catch (e) { console.warn('[E2E] Auto-wrap error:', e); }
}

// ═══════════════════════════════════════════════════════════
//  Message processing
// ═══════════════════════════════════════════════════════════

function hasRealEncText(enc?: EncryptedPayload): boolean {
    return !!(enc && enc.ciphertext && enc.ciphertext.length > 0);
}

async function decryptText(chatId: string, enc: EncryptedPayload, msgId?: string): Promise<string | null> {
    if (!hasRealEncText(enc)) return null;
    if (!cryptoManager.hasChatKey(chatId)) return null;
    try {
        return await cryptoManager.decrypt(chatId, enc.ciphertext, enc.nonce, msgId);
    } catch { return null; }
}

async function decryptReply(reply: ReplyInfoDto | null | undefined, chatId: string): Promise<ReplyInfoDto | undefined> {
    if (!reply) return undefined;
    const plain = await decryptText(chatId, reply.encrypted!);
    if (plain) return { ...reply, content: plain };
    if (hasRealEncText(reply.encrypted)) return { ...reply, content: '🔒 Зашифровано' };
    return reply;
}

async function processMsg(msg: MessageDto, currentUserId: string): Promise<LocalMessage> {
    let content = msg.content;
    let decrypted_content: string | undefined;

    // Try to decrypt text if there's actual encrypted text content
    const plain = await decryptText(msg.chat_id, msg.encrypted!, msg.id);
    if (plain !== null) {
        content = plain;
        decrypted_content = plain;
    } else if (hasRealEncText(msg.encrypted)) {
        content = '🔒 Зашифровано';
    }
    // If content is just the server placeholder, clean it up
    if (content === '[Зашифрованное сообщение]' && !hasRealEncText(msg.encrypted)) {
        content = msg.attachment ? '' : content;
    }

    const reply_to = await decryptReply(msg.reply_to, msg.chat_id);

    return {
        id: msg.id, chat_id: msg.chat_id, sender_id: msg.sender_id,
        sender_name: msg.sender_name, content, decrypted_content,
        edited: msg.edited, created_at: msg.created_at,
        own: msg.sender_id === currentUserId, status: 'delivered',
        attachment: msg.attachment, encrypted: msg.encrypted,
        reply_to, forwarded_from: msg.forwarded_from || undefined,
    };
}

async function reDecryptMessages(messages: LocalMessage[]): Promise<LocalMessage[]> {
    return Promise.all(messages.map(async msg => {
        if (!hasRealEncText(msg.encrypted) || msg.decrypted_content) return msg;
        if (!cryptoManager.hasChatKey(msg.chat_id)) return msg;
        try {
            const content = await cryptoManager.decrypt(msg.chat_id, msg.encrypted!.ciphertext, msg.encrypted!.nonce, msg.id);
            return { ...msg, content, decrypted_content: content };
        } catch { return msg; }
    }));
}

/** Build decrypted preview for sidebar */
function buildPreview(msg: LocalMessage | null, isGroup: boolean, userId: string): { text: string; time: string } {
    if (!msg) return { text: 'Нет сообщений', time: '' };
    const own = msg.sender_id === userId;
    const prefix = isGroup && !own ? `${msg.sender_name}: ` : own ? 'Вы: ' : '';
    const displayText = msg.decrypted_content || msg.content;

    let text: string;
    if (msg.attachment) {
        text = prefix + '📎 ' + msg.attachment.filename;
    } else if (displayText === '[Зашифрованное сообщение]' || displayText === '🔒 Зашифровано') {
        text = prefix + '🔒 Сообщение';
    } else {
        text = prefix + displayText;
    }
    return { text, time: formatTime(msg.created_at) };
}

/** Build preview from raw DTO (for initial load) — async version that decrypts */
async function buildPreviewFromDto(lm: MessageDto | null, isGroup: boolean, userId: string): Promise<{ text: string; time: string }> {
    if (!lm) return { text: 'Нет сообщений', time: '' };
    const own = lm.sender_id === userId;
    const prefix = isGroup && !own ? `${lm.sender_name}: ` : own ? 'Вы: ' : '';

    if (lm.attachment) {
        return { text: prefix + '📎 ' + lm.attachment.filename, time: formatTime(lm.created_at) };
    }

    // Try decrypt
    const plain = await decryptText(lm.chat_id, lm.encrypted!, lm.id);
    if (plain) {
        return { text: prefix + plain, time: formatTime(lm.created_at) };
    }
    if (hasRealEncText(lm.encrypted)) {
        return { text: prefix + '🔒 Сообщение', time: formatTime(lm.created_at) };
    }
    // Not encrypted — use content directly, but clean up server placeholder
    let text = lm.content;
    if (text === '[Зашифрованное сообщение]') text = '🔒 Сообщение';
    return { text: prefix + text, time: formatTime(lm.created_at) };
}

// ═══════════════════════════════════════════════════════════
//  Store
// ═══════════════════════════════════════════════════════════

interface ChatStore {
    chats: LocalChat[];
    selectedId: string | null;
    search: string;
    loading: boolean;
    loadingMessages: boolean;
    loadingOlder: boolean;
    setSearch: (q: string) => void;
    loadChats: (currentUserId: string) => Promise<void>;
    selectChat: (id: string | null, currentUserId: string) => Promise<void>;
    loadOlderMessages: (chatId: string, currentUserId: string) => Promise<void>;
    sendMessage: (chatId: string, text: string, currentUserId: string, currentUserName: string, attachmentId?: string, fileNonce?: string, replyToId?: string) => Promise<void>;
    forwardMessage: (originalMsg: LocalMessage, targetChatId: string, currentUserId: string, currentUserName: string) => Promise<void>;
    editMessage: (messageId: string, newText: string) => void;
    deleteMessage: (messageId: string) => void;
    handleWsEvent: (msg: WsServerMsg, currentUserId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
    chats: [],
    selectedId: localStorage.getItem('selected_chat_id'),
    search: '',
    loading: false,
    loadingMessages: false,
    loadingOlder: false,
    setSearch: search => set({ search }),

    loadChats: async (currentUserId) => {
        set({ loading: true });
        try {
            const dtos = await api.getChats();
            const chats: LocalChat[] = [];
            for (const dto of dtos) {
                const others = dto.members.filter(m => m.user_id !== currentUserId);
                const name = dto.is_group ? (dto.name || 'Группа') : (others[0]?.display_name || 'Чат');
                const p = await buildPreviewFromDto(dto.last_message, dto.is_group, currentUserId);
                chats.push({
                    id: dto.id, is_group: dto.is_group, isChannel: dto.is_channel || false,
                    name, members: dto.members, messages: [], messagesLoaded: false,
                    unread_count: dto.unread_count, online: !dto.is_group && (others[0]?.online || false),
                    created_at: dto.created_at, lastMessageText: p.text, lastMessageTime: p.time,
                    lastActivityAt: dto.last_message?.created_at || dto.created_at,
                    isPinned: dto.members.find(m => m.user_id === currentUserId)?.is_pinned || false,
                    hasMore: true,
                });
            }
            set({ chats, loading: false });
        } catch { set({ loading: false }); }
    },

    selectChat: async (id, currentUserId) => {
        if (id) localStorage.setItem('selected_chat_id', id); else localStorage.removeItem('selected_chat_id');
        set({ selectedId: id });
        if (!id) return;

        const chat = get().chats.find(c => c.id === id);
        if (!chat) return;

        const hadKey = cryptoManager.hasChatKey(id);
        const e2eStatus = await setupChatE2E(id, chat.members, currentUserId);
        if (get().selectedId !== id) return;
        set(s => ({ chats: s.chats.map(c => c.id !== id ? c : { ...c, e2eStatus }) }));

        if (!hadKey && cryptoManager.hasChatKey(id) && chat.messagesLoaded) {
            const msgs = await reDecryptMessages(chat.messages);
            if (get().selectedId !== id) return;
            const lastProcessed = msgs[msgs.length - 1];
            const preview = buildPreview(lastProcessed, chat.is_group, currentUserId);
            set(s => ({ chats: s.chats.map(c => c.id !== id ? c : { ...c, messages: msgs, lastMessageText: preview.text }) }));
            return;
        }

        if (chat.messagesLoaded) {
            // Already loaded — just mark read
            const last = chat.messages[chat.messages.length - 1];
            if (last && !last.own) {
                wsManager.send({ type: 'mark_read', payload: { chat_id: id, message_id: last.id } });
            }
            return;
        }

        set({ loadingMessages: true });
        try {
            const raw = await api.getMessages(id, 50);
            if (get().selectedId !== id) { set({ loadingMessages: false }); return; }
            const msgs = await Promise.all(raw.map(m => processMsg(m, currentUserId)));

            // Update preview with decrypted last message
            const lastProcessed = msgs[msgs.length - 1];
            const preview = buildPreview(lastProcessed, chat.is_group, currentUserId);

            set(s => ({
                chats: s.chats.map(c => c.id !== id ? c : {
                    ...c, messages: msgs, messagesLoaded: true, unread_count: 0,
                    hasMore: raw.length >= 50,
                    lastMessageText: preview.text, lastMessageTime: preview.time,
                }),
                loadingMessages: false,
            }));

            if (raw.length) {
                wsManager.send({ type: 'mark_read', payload: { chat_id: id, message_id: raw[raw.length - 1].id } });
            }
        } catch { set({ loadingMessages: false }); }
    },

    loadOlderMessages: async (chatId, currentUserId) => {
        const chat = get().chats.find(c => c.id === chatId);
        if (!chat || !chat.hasMore || get().loadingOlder) return;

        const oldest = chat.messages[0];
        if (!oldest) return;

        set({ loadingOlder: true });
        try {
            const raw = await api.getMessages(chatId, 50, oldest.id);
            if (get().selectedId !== chatId) { set({ loadingOlder: false }); return; }
            const msgs = await Promise.all(raw.map(m => processMsg(m, currentUserId)));
            set(s => ({
                chats: s.chats.map(c => c.id !== chatId ? c : {
                    ...c, messages: [...msgs, ...c.messages], hasMore: raw.length >= 50,
                }),
                loadingOlder: false,
            }));
        } catch { set({ loadingOlder: false }); }
    },

    sendMessage: async (chatId, text, currentUserId, currentUserName, attachmentId, fileNonce, replyToId) => {
        const trimmed = text.trim();
        if (!trimmed && !attachmentId) return;

        const clientId = uid();
        const now = new Date().toISOString();
        const displayContent = trimmed || (attachmentId ? '📎 Файл' : '');

        let enc: EncryptedPayload | undefined;
        if (trimmed && cryptoManager.hasChatKey(chatId)) {
            try { enc = await cryptoManager.encrypt(chatId, trimmed); } catch { /* fallback */ }
        }
        if (fileNonce) {
            if (enc) { enc.file_nonce = fileNonce; }
            else { enc = { ciphertext: '', nonce: '', file_nonce: fileNonce }; }
        }

        set(s => ({
            chats: s.chats.map(c => c.id !== chatId ? c : {
                ...c,
                messages: [...c.messages, {
                    id: clientId, client_id: clientId, chat_id: chatId,
                    sender_id: currentUserId, sender_name: currentUserName,
                    content: displayContent, decrypted_content: trimmed || undefined,
                    edited: false, created_at: now,
                    own: true, status: 'pending' as const, encrypted: enc,
                }],
                lastMessageText: 'Вы: ' + displayContent,
                lastMessageTime: formatTime(now), lastActivityAt: now,
            })
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: chatId,
                content: hasRealEncText(enc) ? '[Зашифрованное сообщение]' : displayContent,
                client_id: clientId, attachment_id: attachmentId,
                encrypted: enc, reply_to_id: replyToId,
            },
        });
    },

    forwardMessage: async (originalMsg, targetChatId, currentUserId, currentUserName) => {
        const content = originalMsg.decrypted_content || originalMsg.content;
        if (content === '🔒 Зашифровано' || content === '🔒 Не удалось расшифровать') return;

        const clientId = uid();
        const now = new Date().toISOString();
        const displayContent = content || '📎 Файл';

        let enc: EncryptedPayload | undefined;
        if (content && cryptoManager.hasChatKey(targetChatId)) {
            try { enc = await cryptoManager.encrypt(targetChatId, content); } catch { /* */ }
        }

        const canForwardAtt = originalMsg.attachment && !originalMsg.encrypted?.file_nonce;

        set(s => ({
            chats: s.chats.map(c => c.id !== targetChatId ? c : {
                ...c,
                messages: [...c.messages, {
                    id: clientId, client_id: clientId, chat_id: targetChatId,
                    sender_id: currentUserId, sender_name: currentUserName,
                    content: displayContent, decrypted_content: content || undefined,
                    edited: false, created_at: now,
                    own: true, status: 'pending' as const, encrypted: enc,
                    forwarded_from: { original_message_id: originalMsg.id, original_sender_name: originalMsg.sender_name },
                }],
                lastMessageText: 'Вы: ' + displayContent,
                lastMessageTime: formatTime(now), lastActivityAt: now,
            })
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: targetChatId,
                content: hasRealEncText(enc) ? '[Зашифрованное сообщение]' : displayContent,
                client_id: clientId,
                attachment_id: canForwardAtt ? originalMsg.attachment!.id : undefined,
                encrypted: enc,
                forwarded_from_id: originalMsg.id,
                forwarded_from_name: originalMsg.sender_name,
            },
        });
    },

    editMessage: (messageId, newText) => {
        const t = newText.trim(); if (!t) return;
        set(s => ({ chats: s.chats.map(c => ({ ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, content: t, edited: true } : m) })) }));
        wsManager.send({ type: 'edit_message', payload: { message_id: messageId, new_content: t } });
    },

    deleteMessage: (messageId) => {
        set(s => ({ chats: s.chats.map(c => ({ ...c, messages: c.messages.filter(m => m.id !== messageId) })) }));
        wsManager.send({ type: 'delete_message', payload: { message_id: messageId } });
    },

    handleWsEvent: async (msg, currentUserId) => {
        switch (msg.type) {
            case 'new_message':
            case 'message_sent': {
                const raw: MessageDto = msg.payload.message;
                const clientId = msg.type === 'message_sent' ? (msg.payload as any).client_id : undefined;
                const local = await processMsg(raw, currentUserId);

                set(s => {
                    const idx = s.chats.findIndex(c => c.id === raw.chat_id);
                    if (idx === -1) { get().loadChats(currentUserId); return s; }

                    const chat = s.chats[idx];
                    if (chat.messages.some(m => m.id === raw.id)) return s;

                    const pendingIdx = clientId ? chat.messages.findIndex(m => m.client_id === clientId) : -1;
                    let msgs = [...chat.messages];
                    if (pendingIdx !== -1) {
                        msgs[pendingIdx] = { ...local, status: 'sent' };
                    } else if (chat.messagesLoaded) {
                        msgs.push(local);
                    }

                    const preview = buildPreview(local, chat.is_group, currentUserId);
                    const isActive = s.selectedId === raw.chat_id && document.hasFocus() && !document.hidden;
                    const newChats = [...s.chats];
                    newChats[idx] = {
                        ...chat, messages: msgs,
                        unread_count: isActive ? 0 : chat.unread_count + (local.own ? 0 : 1),
                        lastMessageText: preview.text, lastMessageTime: preview.time,
                        lastActivityAt: raw.created_at,
                    };

                    // Auto mark read if chat is active
                    if (isActive && !local.own) {
                        wsManager.send({ type: 'mark_read', payload: { chat_id: raw.chat_id, message_id: raw.id } });
                    }
                    return { chats: newChats };
                });
                break;
            }

            case 'message_edited': {
                const { chat_id, message_id, new_content, encrypted } = msg.payload;
                let content = new_content;
                const plain = await decryptText(chat_id, encrypted!, message_id);
                if (plain !== null) content = plain;
                else if (hasRealEncText(encrypted)) content = '🔒 Зашифровано';
                set(s => ({ chats: s.chats.map(c => c.id !== chat_id ? c : { ...c, messages: c.messages.map(m => m.id !== message_id ? m : { ...m, content, edited: true, decrypted_content: plain || undefined }) }) }));
                break;
            }

            case 'message_deleted': {
                const { chat_id, message_id } = msg.payload;
                set(s => ({ chats: s.chats.map(c => c.id !== chat_id ? c : { ...c, messages: c.messages.filter(m => m.id !== message_id) }) }));
                break;
            }

            case 'user_online':
            case 'user_offline': {
                const userId = msg.payload.user_id;
                const online = msg.type === 'user_online';
                set(s => ({
                    chats: s.chats.map(c => !c.members.some(m => m.user_id === userId) ? c : {
                        ...c, members: c.members.map(m => m.user_id === userId ? { ...m, online } : m),
                        ...(!c.is_group ? { online } : {}),
                    })
                }));
                break;
            }

            case 'user_updated': {
                const u = msg.payload.user;
                set(s => ({
                    chats: s.chats.map(c => !c.members.some(m => m.user_id === u.id) ? c : {
                        ...c,
                        members: c.members.map(m => m.user_id !== u.id ? m : { ...m, display_name: u.display_name, avatar_url: u.avatar_url, online: u.online, public_keys: u.public_keys }),
                        ...(!c.is_group ? { name: u.display_name, online: u.online } : {}),
                    })
                }));

                const sel = get().selectedId;
                if (sel && u.public_keys) {
                    const chat = get().chats.find(c => c.id === sel);
                    if (chat?.members.some(m => m.user_id === u.id)) {
                        const status = await setupChatE2E(sel, chat.members, currentUserId);
                        set(s => ({ chats: s.chats.map(c => c.id !== sel ? c : { ...c, e2eStatus: status }) }));
                        if (status === 'ready' && chat.messages.some(m => hasRealEncText(m.encrypted) && !m.decrypted_content)) {
                            const msgs = await reDecryptMessages(chat.messages);
                            const lastP = msgs[msgs.length - 1];
                            const preview = buildPreview(lastP, chat.is_group, currentUserId);
                            set(s => ({ chats: s.chats.map(c => c.id !== sel ? c : { ...c, messages: msgs, lastMessageText: preview.text }) }));
                        }
                    }
                }
                break;
            }

            case 'chat_deleted':
                set(s => ({ chats: s.chats.filter(c => c.id !== msg.payload.chat_id), selectedId: s.selectedId === msg.payload.chat_id ? null : s.selectedId }));
                break;

            case 'messages_read': {
                const { chat_id, user_id, message_id } = msg.payload;
                if (user_id === currentUserId) {
                    set(s => ({ chats: s.chats.map(c => c.id !== chat_id ? c : { ...c, unread_count: 0 }) }));
                    break;
                }
                // Other user read — mark all own msgs as read
                set(s => ({
                    chats: s.chats.map(c => {
                        if (c.id !== chat_id) return c;
                        return {
                            ...c,
                            messages: c.messages.map(m =>
                                m.own && (m.status === 'sent' || m.status === 'delivered')
                                    ? { ...m, status: 'read' as const }
                                    : m
                            ),
                        };
                    })
                }));
                break;
            }
        }
    },
}));