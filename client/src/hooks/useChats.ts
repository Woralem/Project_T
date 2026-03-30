import { useState, useCallback, useEffect, useRef } from 'react';
import type {
    LocalChat, LocalMessage, WsServerMsg, ChatDto, MessageDto,
    UserDto, EncryptedPayload, ChatMemberDto, NotificationData,
} from '../types';
import { formatTime, uid } from '../utils';
import * as api from '../api';
import { wsManager } from '../websocket';
import { cryptoManager, keystore } from '../crypto';

function serverMsgToLocal(msg: MessageDto, currentUserId: string): LocalMessage {
    return {
        id: msg.id, chat_id: msg.chat_id, sender_id: msg.sender_id,
        sender_name: msg.sender_name, content: msg.content, edited: msg.edited,
        created_at: msg.created_at, own: msg.sender_id === currentUserId,
        status: 'delivered', attachment: msg.attachment, encrypted: msg.encrypted,
        reply_to: msg.reply_to, forwarded_from: msg.forwarded_from,
    };
}

function buildPreview(dto: ChatDto, uid: string) {
    const lm = dto.last_message;
    if (!lm) return { text: '', time: '' };
    const isOwn = lm.sender_id === uid;
    const prefix = dto.is_group && !isOwn ? `${lm.sender_name}: ` : isOwn ? 'Вы: ' : '';
    return { text: prefix + lm.content, time: formatTime(lm.created_at) };
}

function chatDtoToLocal(dto: ChatDto, uid: string): LocalChat {
    const others = dto.members.filter(m => m.user_id !== uid);
    const name = dto.is_group ? (dto.name || 'Групповой чат') : (others[0]?.display_name || 'Чат');
    const online = dto.is_group ? false : (others[0]?.online || false);
    const p = buildPreview(dto, uid);
    return {
        id: dto.id, is_group: dto.is_group, name, members: dto.members,
        messages: [], messagesLoaded: false, unread_count: dto.unread_count,
        online, created_at: dto.created_at, lastMessageText: p.text, lastMessageTime: p.time,
    };
}

function loadSelectedId(): string | null {
    try { return localStorage.getItem('selected_chat_id'); } catch { return null; }
}
function saveSelectedId(id: string | null) {
    try { if (id) localStorage.setItem('selected_chat_id', id); else localStorage.removeItem('selected_chat_id'); } catch { }
}

async function ensureChatKey(chatId: string, currentUserId: string, members?: ChatMemberDto[]): Promise<boolean> {
    if (!cryptoManager.hasKeys()) return false;
    if (cryptoManager.hasChatKey(chatId)) return true;
    const cached = await cryptoManager.loadChatKeyFromCache(chatId);
    if (cached) return true;

    let freshMembers = members;
    if (!freshMembers) {
        try { const dto = await api.getChat(chatId); freshMembers = dto.members; }
        catch { return false; }
    }

    const myMember = freshMembers.find(m => m.user_id === currentUserId);
    if (!myMember?.encrypted_chat_key) return false;
    if (myMember.member_key_id && myMember.member_key_id !== cryptoManager.getKeyId()) return false;

    try { await cryptoManager.unwrapChatKey(chatId, myMember.encrypted_chat_key); return true; }
    catch { return false; }
}

async function tryDecryptMessage(msg: LocalMessage, chatId: string): Promise<LocalMessage> {
    if (!msg.encrypted || !cryptoManager.hasKeys()) return msg;
    if (msg.attachment && msg.content === '🎤 Голосовое сообщение') return msg;

    const cached = await keystore.getDecryptedMessage(msg.id);
    if (cached !== undefined) return { ...msg, content: cached, decrypted_content: cached };
    if (!cryptoManager.hasChatKey(chatId)) return msg;

    try {
        const dec = await cryptoManager.decrypt(chatId, msg.encrypted.ciphertext, msg.encrypted.nonce, msg.id);
        return { ...msg, content: dec, decrypted_content: dec };
    } catch {
        return { ...msg, content: '🔒 Не удалось расшифровать' };
    }
}

async function tryDecryptReply(msg: LocalMessage, chatId: string): Promise<LocalMessage> {
    if (!msg.reply_to?.encrypted || !cryptoManager.hasChatKey(chatId)) return msg;
    try {
        const enc = msg.reply_to.encrypted;
        const dec = await cryptoManager.decrypt(chatId, enc.ciphertext, enc.nonce);
        return { ...msg, reply_to: { ...msg.reply_to, content: dec } };
    } catch { return msg; }
}

async function setupNewChatEncryption(chatDto: ChatDto, currentUserId: string): Promise<void> {
    if (!cryptoManager.hasKeys()) return;
    if (cryptoManager.hasChatKey(chatDto.id)) return;
    const anyHasKey = chatDto.members.some(m => m.encrypted_chat_key);
    if (anyHasKey) { await ensureChatKey(chatDto.id, currentUserId, chatDto.members); return; }
    const membersWithKeys = chatDto.members.filter(m => m.public_keys?.identity_key);
    if (membersWithKeys.length < 2) return;

    try {
        const chatKey = await cryptoManager.generateChatKey();
        const encryptedKeys: Record<string, any> = {};
        for (const member of membersWithKeys) {
            encryptedKeys[member.user_id] = await cryptoManager.wrapChatKey(chatKey, member.public_keys!.identity_key);
        }
        await api.updateChatKeys(chatDto.id, encryptedKeys);
        cryptoManager.setChatKey(chatDto.id, chatKey);
        await cryptoManager.saveChatKeyToCache(chatDto.id, chatKey);
    } catch (e) { console.error('[E2E] Setup chat encryption failed:', e); }
}

// ═══════════════════════════════════════════════════════════

export function useChats(
    user: UserDto | null,
    onNewMessage?: (data: NotificationData) => void,
) {
    const [chats, setChats] = useState<LocalChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(loadSelectedId);
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const loadingRef = useRef(false);
    const currentUserId = user?.id || '';
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const chatsRef = useRef(chats);
    chatsRef.current = chats;
    const onNewMessageRef = useRef(onNewMessage);
    onNewMessageRef.current = onNewMessage;

    const sendMarkRead = useCallback((chatId: string, messageId: string) => {
        wsManager.send({ type: 'mark_read', payload: { chat_id: chatId, message_id: messageId } });
    }, []);

    const loadChats = useCallback(async () => {
        if (!user || loadingRef.current) return;
        loadingRef.current = true;
        setLoadingChats(true);
        try {
            const sc = await api.getChats();
            setChats(prev => {
                const m = new Map(prev.map(c => [c.id, c]));
                return sc.map(dto => {
                    const ex = m.get(dto.id);
                    const fr = chatDtoToLocal(dto, currentUserId);
                    return (ex && ex.messagesLoaded) ? { ...fr, messages: ex.messages, messagesLoaded: true } : fr;
                });
            });
        } catch (e) { console.error('Load chats failed', e); }
        finally { setLoadingChats(false); loadingRef.current = false; }
    }, [user, currentUserId]);

    const refreshChat = useCallback(async (chatId: string) => {
        try {
            const dto = await api.getChat(chatId);
            const local = chatDtoToLocal(dto, currentUserId);
            setChats(prev => prev.map(c => c.id !== chatId ? c : { ...local, messages: c.messages, messagesLoaded: c.messagesLoaded }));
        } catch (e) { console.error('Refresh chat failed', e); }
    }, [currentUserId]);

    const selectChat = useCallback(async (chatId: string) => {
        setSelectedId(chatId);
        saveSelectedId(chatId);
        setChats(prev => prev.map(c => c.id !== chatId ? c : { ...c, unread_count: 0 }));

        let chat = chatsRef.current.find(c => c.id === chatId);
        if (!chat) return;

        if (cryptoManager.hasKeys() && !cryptoManager.hasChatKey(chatId)) {
            const cached = await cryptoManager.loadChatKeyFromCache(chatId);
            if (!cached) {
                try {
                    const freshDto = await api.getChat(chatId);
                    const freshLocal = chatDtoToLocal(freshDto, currentUserId);
                    setChats(prev => prev.map(c => c.id !== chatId ? c : { ...c, members: freshLocal.members }));
                    chat = { ...chat, members: freshLocal.members };
                    await ensureChatKey(chatId, currentUserId, freshLocal.members);
                } catch { }
            }
        }

        if (chat.messagesLoaded) {
            if (chat.messages.length > 0) sendMarkRead(chatId, chat.messages[chat.messages.length - 1].id);
            return;
        }

        setLoadingMessages(true);
        try {
            const msgs = await api.getMessages(chatId);
            let local = await Promise.all(msgs.map(m => tryDecryptMessage(serverMsgToLocal(m, currentUserId), chatId)));
            local = await Promise.all(local.map(m => tryDecryptReply(m, chatId)));
            setChats(prev => prev.map(c => c.id !== chatId ? c : { ...c, messages: local, messagesLoaded: true, unread_count: 0 }));
            if (local.length > 0) sendMarkRead(chatId, local[local.length - 1].id);
        } catch (e) { console.error('Load messages failed', e); }
        finally { setLoadingMessages(false); }
    }, [currentUserId, sendMarkRead]);

    const sendMessage = useCallback(async (text: string, replyToId?: string) => {
        if (!selectedId || !text.trim() || !user) return;
        const trimmed = text.trim();
        const clientId = uid();
        const now = new Date().toISOString();

        let enc: EncryptedPayload | undefined;
        if (cryptoManager.hasChatKey(selectedId)) {
            try { enc = await cryptoManager.encrypt(selectedId, trimmed); } catch { }
        }

        const replyInfo = replyToId ? chatsRef.current.find(c => c.id === selectedId)?.messages.find(m => m.id === replyToId) : undefined;

        const pending: LocalMessage = {
            id: clientId, client_id: clientId, chat_id: selectedId,
            sender_id: user.id, sender_name: user.display_name, content: trimmed,
            edited: false, created_at: now, own: true, status: 'pending', encrypted: enc,
            reply_to: replyInfo ? { id: replyInfo.id, sender_id: replyInfo.sender_id, sender_name: replyInfo.sender_name, content: replyInfo.content, attachment: replyInfo.attachment } : undefined,
        };

        setChats(prev => prev.map(c => c.id !== selectedId ? c : {
            ...c, messages: [...c.messages, pending],
            lastMessageText: 'Вы: ' + trimmed, lastMessageTime: formatTime(now),
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: selectedId,
                content: enc ? '[Зашифрованное сообщение]' : trimmed,
                client_id: clientId, encrypted: enc,
                reply_to_id: replyToId,
            },
        });
    }, [selectedId, user]);

    const sendVoiceMessage = useCallback(async (chatId: string, blob: Blob) => {
        if (!user) return;
        const clientId = uid();
        const now = new Date().toISOString();
        let attachmentId: string | null = null;
        let encMeta: EncryptedPayload | undefined;
        let finalMime = blob.type || 'audio/webm';

        if (cryptoManager.hasChatKey(chatId)) {
            try {
                const audioData = await blob.arrayBuffer();
                const { encryptedData, nonce } = await cryptoManager.encryptBuffer(chatId, audioData);
                const encBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
                const att = await api.uploadFile(encBlob, 'voice.enc');
                attachmentId = att.id;
                finalMime = 'audio/encrypted';
                encMeta = { ciphertext: '', nonce };
            } catch { attachmentId = null; }
        }

        if (!attachmentId) {
            try {
                const ext = blob.type.includes('webm') ? 'webm' : 'ogg';
                const att = await api.uploadFile(blob, `voice.${ext}`);
                attachmentId = att.id;
            } catch (e) { console.error('Voice upload failed:', e); return; }
        }

        const pending: LocalMessage = {
            id: clientId, client_id: clientId, chat_id: chatId,
            sender_id: user.id, sender_name: user.display_name,
            content: '🎤 Голосовое сообщение', edited: false, created_at: now,
            own: true, status: 'pending',
            attachment: { id: attachmentId, filename: 'voice', mime_type: finalMime, size_bytes: blob.size },
            encrypted: encMeta,
        };

        setChats(prev => prev.map(c => c.id !== chatId ? c : {
            ...c, messages: [...c.messages, pending],
            lastMessageText: 'Вы: 🎤 Голосовое', lastMessageTime: formatTime(now),
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: chatId, content: '🎤 Голосовое сообщение',
                client_id: clientId, attachment_id: attachmentId, encrypted: encMeta,
            },
        });
    }, [user]);

    const sendFileMessage = useCallback(async (chatId: string, file: File, caption: string, replyToId?: string) => {
        if (!user) return;
        const clientId = uid();
        const now = new Date().toISOString();
        let attachmentId: string;
        let encMeta: EncryptedPayload | undefined;
        let finalMime = file.type || 'application/octet-stream';
        const originalName = file.name;

        if (cryptoManager.hasChatKey(chatId)) {
            try {
                const fileData = await file.arrayBuffer();
                const { encryptedData, nonce } = await cryptoManager.encryptBuffer(chatId, fileData);
                const encBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
                const att = await api.uploadFile(encBlob, originalName + '.enc');
                attachmentId = att.id;
                encMeta = { ciphertext: '', nonce };
            } catch {
                const att = await api.uploadFile(file, originalName);
                attachmentId = att.id;
            }
        } else {
            const att = await api.uploadFile(file, originalName);
            attachmentId = att.id;
        }

        const displayContent = caption || `📎 ${originalName}`;
        let encContent: EncryptedPayload | undefined;
        if (caption && cryptoManager.hasChatKey(chatId)) {
            try { encContent = await cryptoManager.encrypt(chatId, caption); } catch { }
        }

        const replyInfo = replyToId ? chatsRef.current.find(c => c.id === chatId)?.messages.find(m => m.id === replyToId) : undefined;

        const pending: LocalMessage = {
            id: clientId, client_id: clientId, chat_id: chatId,
            sender_id: user.id, sender_name: user.display_name,
            content: displayContent, edited: false, created_at: now,
            own: true, status: 'pending',
            attachment: { id: attachmentId, filename: originalName, mime_type: finalMime, size_bytes: file.size },
            encrypted: encMeta,
            reply_to: replyInfo ? { id: replyInfo.id, sender_id: replyInfo.sender_id, sender_name: replyInfo.sender_name, content: replyInfo.content } : undefined,
        };

        setChats(prev => prev.map(c => c.id !== chatId ? c : {
            ...c, messages: [...c.messages, pending],
            lastMessageText: 'Вы: ' + displayContent, lastMessageTime: formatTime(now),
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: chatId,
                content: encContent ? '[Зашифрованное сообщение]' : displayContent,
                client_id: clientId, attachment_id: attachmentId,
                encrypted: encMeta || encContent,
                reply_to_id: replyToId,
            },
        });
    }, [user]);

    const forwardMessage = useCallback(async (msg: LocalMessage, targetChatId: string) => {
        if (!user) return;
        const clientId = uid();
        const now = new Date().toISOString();

        let content = msg.decrypted_content || msg.content;
        let enc: EncryptedPayload | undefined;
        if (cryptoManager.hasChatKey(targetChatId) && content && content !== '[Зашифрованное сообщение]') {
            try { enc = await cryptoManager.encrypt(targetChatId, content); } catch { }
        }

        const pending: LocalMessage = {
            id: clientId, client_id: clientId, chat_id: targetChatId,
            sender_id: user.id, sender_name: user.display_name,
            content: content, edited: false, created_at: now,
            own: true, status: 'pending', encrypted: enc,
            forwarded_from: { original_message_id: msg.id, original_sender_name: msg.sender_name },
        };

        setChats(prev => prev.map(c => c.id !== targetChatId ? c : {
            ...c, messages: [...c.messages, pending],
            lastMessageText: 'Вы: ' + content, lastMessageTime: formatTime(now),
        }));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: targetChatId,
                content: enc ? '[Зашифрованное сообщение]' : content,
                client_id: clientId, encrypted: enc,
                forwarded_from_id: msg.id,
                forwarded_from_name: msg.sender_name,
            },
        });

        setSelectedId(targetChatId);
        saveSelectedId(targetChatId);
    }, [user]);

    const editMessage = useCallback(async (messageId: string, newText: string) => {
        if (!newText.trim() || !user) return;
        const t = newText.trim();
        let enc: EncryptedPayload | undefined;
        for (const chat of chatsRef.current) {
            if (chat.messages.find(m => m.id === messageId)) {
                if (cryptoManager.hasChatKey(chat.id)) { try { enc = await cryptoManager.encrypt(chat.id, t); } catch { } }
                break;
            }
        }
        await keystore.saveDecryptedMessage(messageId, t);
        setChats(prev => prev.map(c => ({
            ...c, messages: c.messages.map(m => m.id !== messageId ? m : { ...m, content: t, edited: true }),
        })));
        wsManager.send({ type: 'edit_message', payload: { message_id: messageId, new_content: enc ? '[Зашифрованное сообщение]' : t, encrypted: enc } });
    }, [user]);

    const deleteMessage = useCallback((messageId: string) => {
        setChats(prev => prev.map(c => ({ ...c, messages: c.messages.filter(m => m.id !== messageId) })));
        wsManager.send({ type: 'delete_message', payload: { message_id: messageId } });
    }, []);

    const createChat = useCallback(async (memberIds: string[], isGroup: boolean, name?: string) => {
        const nc = await api.createChat(memberIds, isGroup, name);
        const lc = chatDtoToLocal(nc, currentUserId);
        if (cryptoManager.hasKeys()) await setupNewChatEncryption(nc, currentUserId);
        setChats(prev => prev.find(c => c.id === nc.id) ? prev : [lc, ...prev]);
        setSelectedId(nc.id);
        saveSelectedId(nc.id);
        return nc;
    }, [currentUserId]);

    // ── WebSocket ────────────────────────────────────────

    useEffect(() => {
        if (!user) return;
        const unsub = wsManager.subscribe(async (msg: WsServerMsg) => {
            switch (msg.type) {
                case 'message_sent': {
                    const { client_id, message } = msg.payload;
                    const chat = chatsRef.current.find(c => c.id === message.chat_id);
                    const ownMsg = chat?.messages.find(m => m.client_id === client_id);
                    if (ownMsg && ownMsg.encrypted) await keystore.saveDecryptedMessage(message.id, ownMsg.content);

                    setChats(prev => prev.map(c => c.id !== message.chat_id ? c : {
                        ...c, messages: c.messages.map(m => {
                            if (m.client_id !== client_id) return m;
                            const u = serverMsgToLocal(message, currentUserId);
                            return { ...u, status: 'sent' as const, content: m.content, attachment: m.attachment || u.attachment, encrypted: m.encrypted, reply_to: m.reply_to || u.reply_to, forwarded_from: m.forwarded_from || u.forwarded_from };
                        }),
                        lastMessageText: 'Вы: ' + (c.messages.find(m => m.client_id === client_id)?.content || message.content),
                        lastMessageTime: formatTime(message.created_at),
                    }));
                    break;
                }

                case 'new_message': {
                    const { message } = msg.payload;
                    let lm = serverMsgToLocal(message, currentUserId);

                    if (message.encrypted && cryptoManager.hasKeys() && !message.attachment) {
                        if (!cryptoManager.hasChatKey(message.chat_id)) await ensureChatKey(message.chat_id, currentUserId);
                        if (cryptoManager.hasChatKey(message.chat_id)) {
                            try {
                                const dec = await cryptoManager.decrypt(message.chat_id, message.encrypted.ciphertext, message.encrypted.nonce, message.id);
                                lm = { ...lm, content: dec, decrypted_content: dec };
                            } catch { lm = { ...lm, content: '🔒 Не удалось расшифровать' }; }
                        } else { lm = { ...lm, content: '🔒 Зашифровано' }; }
                    }

                    lm = await tryDecryptReply(lm, message.chat_id);

                    const isSelected = selectedIdRef.current === message.chat_id;
                    const isWindowActive = document.hasFocus() && !document.hidden;
                    const shouldNotify = !isSelected || !isWindowActive;

                    setChats(prev => {
                        if (!prev.some(c => c.id === message.chat_id)) { loadChats(); return prev; }
                        return prev.map(c => {
                            if (c.id !== message.chat_id || c.messages.some(m => m.id === message.id)) return c;
                            const display = lm.decrypted_content || lm.content;
                            const pref = c.is_group ? `${message.sender_name}: ` : '';
                            return {
                                ...c,
                                messages: c.messagesLoaded ? [...c.messages, lm] : c.messages,
                                unread_count: (isSelected && isWindowActive) ? 0 : c.unread_count + 1,
                                lastMessageText: pref + display,
                                lastMessageTime: formatTime(message.created_at),
                            };
                        });
                    });

                    if (isSelected && isWindowActive) sendMarkRead(message.chat_id, message.id);

                    if (shouldNotify && onNewMessageRef.current) {
                        const chat = chatsRef.current.find(c => c.id === message.chat_id);
                        const sender = chat?.members.find(m => m.user_id === message.sender_id);
                        onNewMessageRef.current({
                            id: message.id, chatId: message.chat_id,
                            chatName: chat?.name || message.sender_name,
                            senderName: message.sender_name, senderAvatarUrl: sender?.avatar_url,
                            text: lm.content, isGroup: chat?.is_group || false,
                        });
                    }
                    break;
                }

                case 'message_edited': {
                    const { chat_id, message_id, new_content, encrypted } = msg.payload;
                    let d = new_content;
                    if (encrypted && cryptoManager.hasChatKey(chat_id)) {
                        try { d = await cryptoManager.decrypt(chat_id, encrypted.ciphertext, encrypted.nonce, message_id); } catch { d = '🔒'; }
                    }
                    setChats(prev => prev.map(c => c.id !== chat_id ? c : {
                        ...c, messages: c.messages.map(m => m.id !== message_id ? m : { ...m, content: d, edited: true }),
                    }));
                    break;
                }

                case 'message_deleted': {
                    const { chat_id, message_id } = msg.payload;
                    setChats(prev => prev.map(c => c.id !== chat_id ? c : { ...c, messages: c.messages.filter(m => m.id !== message_id) }));
                    break;
                }

                case 'messages_read': {
                    const { chat_id, user_id, message_id } = msg.payload;
                    if (user_id === currentUserId) break;
                    setChats(prev => prev.map(c => {
                        if (c.id !== chat_id) return c;
                        const readIdx = c.messages.findIndex(m => m.id === message_id);
                        if (readIdx === -1) {
                            const hasUnread = c.messages.some(m => m.own && (m.status === 'sent' || m.status === 'delivered'));
                            if (!hasUnread) return c;
                            return { ...c, messages: c.messages.map(m => m.own && (m.status === 'sent' || m.status === 'delivered') ? { ...m, status: 'read' as const } : m) };
                        }
                        return { ...c, messages: c.messages.map((m, idx) => m.own && idx <= readIdx && (m.status === 'sent' || m.status === 'delivered') ? { ...m, status: 'read' as const } : m) };
                    }));
                    break;
                }

                case 'user_online': {
                    const { user_id } = msg.payload;
                    setChats(prev => prev.map(c => c.is_group ? c : c.members.some(m => m.user_id === user_id) ? { ...c, online: true } : c));
                    break;
                }
                case 'user_offline': {
                    const { user_id } = msg.payload;
                    setChats(prev => prev.map(c => c.is_group ? c : c.members.some(m => m.user_id === user_id) ? { ...c, online: false } : c));
                    break;
                }
                case 'user_updated': {
                    const { user: uu } = msg.payload;
                    setChats(prev => prev.map(c => ({
                        ...c,
                        members: c.members.map(m => m.user_id !== uu.id ? m : { ...m, display_name: uu.display_name, avatar_url: uu.avatar_url, public_keys: uu.public_keys }),
                        name: !c.is_group && c.members.some(m => m.user_id === uu.id && m.user_id !== currentUserId) ? uu.display_name : c.name,
                    })));
                    break;
                }
                case 'error': { console.error('[WS]', msg.payload.message); break; }
            }
        });
        return unsub;
    }, [user, currentUserId, loadChats, sendMarkRead]);

    useEffect(() => {
        const onFocus = () => {
            const chatId = selectedIdRef.current;
            if (!chatId) return;
            const chat = chatsRef.current.find(c => c.id === chatId);
            if (!chat || !chat.messagesLoaded || chat.messages.length === 0) return;
            const lastMsg = chat.messages[chat.messages.length - 1];
            if (!lastMsg.own) { sendMarkRead(chatId, lastMsg.id); setChats(prev => prev.map(c => c.id !== chatId ? c : { ...c, unread_count: 0 })); }
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) onFocus(); });
        return () => { window.removeEventListener('focus', onFocus); };
    }, [sendMarkRead]);

    useEffect(() => {
        if (!user) return;
        const u = wsManager.onStatusChange(c => { if (c) loadChats(); });
        return u;
    }, [user, loadChats]);

    useEffect(() => { if (user) loadChats(); else { setChats([]); setSelectedId(null); } }, [user, loadChats]);

    useEffect(() => {
        if (chats.length > 0 && selectedId) {
            if (chats.some(c => c.id === selectedId)) {
                const ch = chats.find(c => c.id === selectedId);
                if (ch && !ch.messagesLoaded) selectChat(selectedId);
            } else { setSelectedId(null); saveSelectedId(null); }
        }
    }, [chats.length]);

    return {
        chats, selectedId,
        selectedChat: chats.find(c => c.id === selectedId) ?? null,
        loadingChats, loadingMessages,
        selectChat, sendMessage, sendVoiceMessage, sendFileMessage, forwardMessage,
        editMessage, deleteMessage, createChat, loadChats, refreshChat,
    };
}