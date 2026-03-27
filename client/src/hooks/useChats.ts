// client/src/hooks/useChats.ts

import { useState, useCallback, useEffect, useRef } from 'react';
import type { LocalChat, LocalMessage, WsServerMsg, ChatDto, MessageDto, UserDto, EncryptedPayload } from '../types';
import { formatTime, uid } from '../utils';
import * as api from '../api';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';

// ═══════════════════════════════════════════════════════════
//  Конверторы
// ═══════════════════════════════════════════════════════════

function serverMsgToLocal(msg: MessageDto, currentUserId: string): LocalMessage {
    return {
        id: msg.id,
        chat_id: msg.chat_id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        content: msg.content,
        edited: msg.edited,
        created_at: msg.created_at,
        own: msg.sender_id === currentUserId,
        status: 'delivered',
        attachment: msg.attachment,
        encrypted: msg.encrypted,
    };
}

function buildPreview(dto: ChatDto, currentUserId: string): { text: string; time: string } {
    const lm = dto.last_message;
    if (!lm) return { text: '', time: '' };

    const isOwn = lm.sender_id === currentUserId;
    const prefix = dto.is_group && !isOwn
        ? `${lm.sender_name}: `
        : isOwn ? 'Вы: ' : '';

    return {
        text: prefix + lm.content,
        time: formatTime(lm.created_at),
    };
}

function chatDtoToLocal(dto: ChatDto, currentUserId: string): LocalChat {
    const otherMembers = dto.members.filter(m => m.user_id !== currentUserId);
    const name = dto.is_group
        ? (dto.name || 'Групповой чат')
        : (otherMembers[0]?.display_name || 'Чат');
    const online = dto.is_group ? false : (otherMembers[0]?.online || false);
    const preview = buildPreview(dto, currentUserId);

    return {
        id: dto.id,
        is_group: dto.is_group,
        name,
        members: dto.members,
        messages: [],
        messagesLoaded: false,
        unread_count: dto.unread_count,
        online,
        created_at: dto.created_at,
        lastMessageText: preview.text,
        lastMessageTime: preview.time,
    };
}

// ═══════════════════════════════════════════════════════════
//  localStorage helpers
// ═══════════════════════════════════════════════════════════

function loadSelectedId(): string | null {
    try { return localStorage.getItem('selected_chat_id'); } catch { return null; }
}

function saveSelectedId(id: string | null) {
    try {
        if (id) localStorage.setItem('selected_chat_id', id);
        else localStorage.removeItem('selected_chat_id');
    } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════
//  E2E helpers
// ═══════════════════════════════════════════════════════════

async function setupChatEncryption(members: { user_id: string; public_keys?: { identity_key: string } | null }[], myUserId: string): Promise<void> {
    for (const member of members) {
        if (member.user_id === myUserId) continue;
        if (!member.public_keys?.identity_key) continue;

        try {
            await cryptoManager.deriveSessionKey(
                member.public_keys.identity_key,
                member.user_id
            );
        } catch (e) {
            console.warn(`Failed to derive key for ${member.user_id}:`, e);
        }
    }
}

function isChatEncrypted(members: { user_id: string; public_keys?: { identity_key: string } | null }[], myUserId: string): boolean {
    if (!cryptoManager.hasKeys()) return false;
    return members.every(m =>
        m.user_id === myUserId || !!m.public_keys?.identity_key
    );
}

async function tryDecryptMessage(msg: LocalMessage): Promise<LocalMessage> {
    if (!msg.encrypted || !cryptoManager.hasKeys()) return msg;

    try {
        const decrypted = await cryptoManager.decrypt(
            msg.sender_id,
            msg.encrypted.ciphertext,
            msg.encrypted.nonce
        );
        if (decrypted) {
            return { ...msg, content: decrypted, decrypted_content: decrypted };
        }
    } catch (e) {
        console.warn('Failed to decrypt message:', msg.id, e);
    }
    return msg;
}

// ═══════════════════════════════════════════════════════════
//  Hook
// ═══════════════════════════════════════════════════════════

export function useChats(user: UserDto | null) {
    const [chats, setChats] = useState<LocalChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(loadSelectedId);
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);

    const loadingRef = useRef(false);
    const currentUserId = user?.id || '';
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;

    // ── Загрузка списка чатов ──────────────────────────────
    const loadChats = useCallback(async () => {
        if (!user || loadingRef.current) return;
        loadingRef.current = true;
        setLoadingChats(true);

        try {
            const serverChats = await api.getChats();
            setChats(prev => {
                const existingMap = new Map(prev.map(c => [c.id, c]));

                return serverChats.map(dto => {
                    const existing = existingMap.get(dto.id);
                    const fresh = chatDtoToLocal(dto, currentUserId);

                    if (existing && existing.messagesLoaded) {
                        return {
                            ...fresh,
                            messages: existing.messages,
                            messagesLoaded: true,
                        };
                    }
                    return fresh;
                });
            });
        } catch (e) {
            console.error('Failed to load chats', e);
        } finally {
            setLoadingChats(false);
            loadingRef.current = false;
        }
    }, [user, currentUserId]);

    // ── Загрузка сообщений при выборе чата ──────────────────
    const selectChat = useCallback(async (chatId: string) => {
        setSelectedId(chatId);
        saveSelectedId(chatId);

        setChats(prev => prev.map(c =>
            c.id !== chatId ? c : { ...c, unread_count: 0 }
        ));

        const chat = chats.find(c => c.id === chatId);
        if (chat?.messagesLoaded) return;

        // Устанавливаем сессионные ключи для E2E
        if (chat && cryptoManager.hasKeys()) {
            await setupChatEncryption(chat.members, currentUserId);
        }

        setLoadingMessages(true);
        try {
            const msgs = await api.getMessages(chatId);

            // Конвертируем и расшифровываем сообщения
            const localMsgs = await Promise.all(
                msgs.map(async m => {
                    const local = serverMsgToLocal(m, currentUserId);
                    return tryDecryptMessage(local);
                })
            );

            setChats(prev => prev.map(c =>
                c.id !== chatId ? c : {
                    ...c,
                    messages: localMsgs,
                    messagesLoaded: true,
                    unread_count: 0,
                }
            ));
        } catch (e) {
            console.error('Failed to load messages', e);
        } finally {
            setLoadingMessages(false);
        }
    }, [currentUserId, chats]);

    // ── Отправка текстового сообщения ───────────────────────
    const sendMessage = useCallback(async (text: string) => {
        if (!selectedId || !text.trim() || !user) return;

        const trimmed = text.trim();
        const clientId = uid();
        const now = new Date().toISOString();

        const chat = chats.find(c => c.id === selectedId);
        const encrypted = chat && isChatEncrypted(chat.members, user.id);

        // Шифрование для личных чатов
        let encryptedPayload: EncryptedPayload | undefined;
        if (encrypted && chat && !chat.is_group) {
            const recipient = chat.members.find(m => m.user_id !== user.id);
            if (recipient) {
                try {
                    const enc = await cryptoManager.encrypt(recipient.user_id, trimmed);
                    encryptedPayload = enc;
                } catch (e) {
                    console.warn('Encryption failed, sending unencrypted:', e);
                }
            }
        }

        // Для групповых чатов с E2E — шифруем для каждого участника
        // (упрощённый вариант: шифруем для первого найденного)
        if (encrypted && chat && chat.is_group) {
            // В production нужно шифровать для каждого участника отдельно
            // Пока шифруем общим ключом с первым участником
            const recipient = chat.members.find(
                m => m.user_id !== user.id && m.public_keys?.identity_key
            );
            if (recipient) {
                try {
                    const enc = await cryptoManager.encrypt(recipient.user_id, trimmed);
                    encryptedPayload = enc;
                } catch (e) {
                    console.warn('Group encryption failed:', e);
                }
            }
        }

        const pendingMsg: LocalMessage = {
            id: clientId,
            client_id: clientId,
            chat_id: selectedId,
            sender_id: user.id,
            sender_name: user.display_name,
            content: trimmed, // Отправитель видит оригинальный текст
            edited: false,
            created_at: now,
            own: true,
            status: 'pending',
            encrypted: encryptedPayload,
        };

        setChats(prev => prev.map(c =>
            c.id !== selectedId ? c : {
                ...c,
                messages: [...c.messages, pendingMsg],
                lastMessageText: 'Вы: ' + trimmed,
                lastMessageTime: formatTime(now),
            }
        ));

        // На сервер отправляем плейсхолдер если зашифровано
        const serverContent = encryptedPayload ? '[Зашифрованное сообщение]' : trimmed;

        const sent = wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: selectedId,
                content: serverContent,
                client_id: clientId,
                encrypted: encryptedPayload,
            },
        });

        if (!sent) {
            setChats(prev => prev.map(c =>
                c.id !== selectedId ? c : {
                    ...c,
                    messages: c.messages.map(m =>
                        m.client_id === clientId ? { ...m, status: 'sent' as const } : m
                    ),
                }
            ));
        }
    }, [selectedId, user, chats]);

    // ── Отправка голосового сообщения ───────────────────────
    const sendVoiceMessage = useCallback((chatId: string, attachmentId: string) => {
        if (!user) return;

        const clientId = uid();
        const now = new Date().toISOString();

        const pendingMsg: LocalMessage = {
            id: clientId,
            client_id: clientId,
            chat_id: chatId,
            sender_id: user.id,
            sender_name: user.display_name,
            content: '🎤 Голосовое сообщение',
            edited: false,
            created_at: now,
            own: true,
            status: 'pending',
            attachment: {
                id: attachmentId,
                filename: 'voice',
                mime_type: 'audio/webm',
                size_bytes: 0,
            },
        };

        setChats(prev => prev.map(c =>
            c.id !== chatId ? c : {
                ...c,
                messages: [...c.messages, pendingMsg],
                lastMessageText: 'Вы: 🎤 Голосовое сообщение',
                lastMessageTime: formatTime(now),
            }
        ));

        wsManager.send({
            type: 'send_message',
            payload: {
                chat_id: chatId,
                content: '🎤 Голосовое сообщение',
                client_id: clientId,
                attachment_id: attachmentId,
            },
        });
    }, [user]);

    // ── Редактирование ──────────────────────────────────────
    const editMessage = useCallback(async (messageId: string, newText: string) => {
        if (!newText.trim() || !user) return;

        const trimmedText = newText.trim();

        // Находим сообщение и чат
        let chatId: string | null = null;
        let encrypted: EncryptedPayload | undefined;

        for (const chat of chats) {
            const msg = chat.messages.find(m => m.id === messageId);
            if (msg) {
                chatId = chat.id;
                // Если чат зашифрован — шифруем новый текст
                if (isChatEncrypted(chat.members, user.id) && !chat.is_group) {
                    const recipient = chat.members.find(m => m.user_id !== user.id);
                    if (recipient) {
                        try {
                            const enc = await cryptoManager.encrypt(recipient.user_id, trimmedText);
                            encrypted = enc;
                        } catch (e) {
                            console.warn('Edit encryption failed:', e);
                        }
                    }
                }
                break;
            }
        }

        setChats(prev => prev.map(c => ({
            ...c,
            messages: c.messages.map(m =>
                m.id !== messageId ? m : { ...m, content: trimmedText, edited: true }
            ),
        })));

        const serverContent = encrypted ? '[Зашифрованное сообщение]' : trimmedText;

        wsManager.send({
            type: 'edit_message',
            payload: {
                message_id: messageId,
                new_content: serverContent,
                encrypted,
            },
        });
    }, [user, chats]);

    // ── Удаление ────────────────────────────────────────────
    const deleteMessage = useCallback((messageId: string) => {
        setChats(prev => prev.map(c => ({
            ...c,
            messages: c.messages.filter(m => m.id !== messageId),
        })));

        wsManager.send({
            type: 'delete_message',
            payload: { message_id: messageId },
        });
    }, []);

    // ── Создание чата (с защитой от дубликатов) ─────────────
    const createChat = useCallback(async (
        memberIds: string[],
        isGroup: boolean,
        name?: string,
    ) => {
        try {
            const newChat = await api.createChat(memberIds, isGroup, name);

            const localChat = chatDtoToLocal(newChat, currentUserId);

            // Устанавливаем E2E ключи для нового чата
            if (cryptoManager.hasKeys()) {
                await setupChatEncryption(newChat.members, currentUserId);
            }

            setChats(prev => {
                const exists = prev.find(c => c.id === newChat.id);
                if (exists) return prev;
                return [localChat, ...prev];
            });

            setSelectedId(newChat.id);
            saveSelectedId(newChat.id);
            return newChat;
        } catch (e) {
            console.error('Failed to create chat', e);
            throw e;
        }
    }, [currentUserId]);

    // ── WebSocket events ───────────────────────────────────
    useEffect(() => {
        if (!user) return;

        const unsubscribe = wsManager.subscribe(async (msg: WsServerMsg) => {
            switch (msg.type) {
                case 'message_sent': {
                    const { client_id, message } = msg.payload;
                    setChats(prev => prev.map(c =>
                        c.id !== message.chat_id ? c : {
                            ...c,
                            messages: c.messages.map(m => {
                                if (m.client_id !== client_id) return m;
                                const updated = serverMsgToLocal(message, currentUserId);
                                // Сохраняем оригинальный контент для отправителя
                                return {
                                    ...updated,
                                    status: 'sent' as const,
                                    content: m.content, // Оригинальный незашифрованный текст
                                };
                            }),
                            lastMessageText: 'Вы: ' + (
                                // Используем локальный текст
                                c.messages.find(m => m.client_id === client_id)?.content || message.content
                            ),
                            lastMessageTime: formatTime(message.created_at),
                        }
                    ));
                    break;
                }

                case 'new_message': {
                    const { message } = msg.payload;

                    // Пробуем расшифровать
                    let localMsg = serverMsgToLocal(message, currentUserId);
                    if (message.encrypted && cryptoManager.hasKeys()) {
                        try {
                            // Убеждаемся что есть сессионный ключ
                            const chat = chats.find(c => c.id === message.chat_id);
                            if (chat) {
                                await setupChatEncryption(chat.members, currentUserId);
                            }

                            const decrypted = await cryptoManager.decrypt(
                                message.sender_id,
                                message.encrypted.ciphertext,
                                message.encrypted.nonce
                            );
                            if (decrypted) {
                                localMsg = {
                                    ...localMsg,
                                    content: decrypted,
                                    decrypted_content: decrypted,
                                };
                            }
                        } catch (e) {
                            console.warn('Failed to decrypt incoming message:', e);
                        }
                    }

                    setChats(prev => {
                        const chatExists = prev.some(c => c.id === message.chat_id);
                        if (!chatExists) {
                            loadChats();
                            return prev;
                        }

                        return prev.map(c => {
                            if (c.id !== message.chat_id) return c;
                            if (c.messages.some(m => m.id === message.id)) return c;

                            const isSelected = selectedIdRef.current === c.id;
                            const displayContent = localMsg.decrypted_content || localMsg.content;
                            const senderPrefix = c.is_group ? `${message.sender_name}: ` : '';

                            return {
                                ...c,
                                messages: c.messagesLoaded ? [...c.messages, localMsg] : c.messages,
                                unread_count: isSelected ? 0 : c.unread_count + 1,
                                lastMessageText: senderPrefix + displayContent,
                                lastMessageTime: formatTime(message.created_at),
                            };
                        });
                    });
                    break;
                }

                case 'message_edited': {
                    const { chat_id, message_id, new_content, encrypted } = msg.payload;

                    let displayContent = new_content;

                    // Расшифровываем если есть encrypted payload
                    if (encrypted && cryptoManager.hasKeys()) {
                        try {
                            const chat = chats.find(c => c.id === chat_id);
                            const editedMsg = chat?.messages.find(m => m.id === message_id);
                            if (editedMsg) {
                                const decrypted = await cryptoManager.decrypt(
                                    editedMsg.sender_id,
                                    encrypted.ciphertext,
                                    encrypted.nonce
                                );
                                if (decrypted) {
                                    displayContent = decrypted;
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to decrypt edited message:', e);
                        }
                    }

                    setChats(prev => prev.map(c =>
                        c.id !== chat_id ? c : {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id !== message_id ? m : {
                                    ...m,
                                    content: displayContent,
                                    edited: true,
                                }
                            ),
                        }
                    ));
                    break;
                }

                case 'message_deleted': {
                    const { chat_id, message_id } = msg.payload;
                    setChats(prev => prev.map(c =>
                        c.id !== chat_id ? c : {
                            ...c,
                            messages: c.messages.filter(m => m.id !== message_id),
                        }
                    ));
                    break;
                }

                case 'user_online': {
                    const { user_id } = msg.payload;
                    setChats(prev => prev.map(c => {
                        if (c.is_group) return c;
                        const isMember = c.members.some(m => m.user_id === user_id);
                        return isMember ? { ...c, online: true } : c;
                    }));
                    break;
                }

                case 'user_offline': {
                    const { user_id } = msg.payload;
                    setChats(prev => prev.map(c => {
                        if (c.is_group) return c;
                        const isMember = c.members.some(m => m.user_id === user_id);
                        return isMember ? { ...c, online: false } : c;
                    }));
                    break;
                }

                case 'user_updated': {
                    const { user: updatedUser } = msg.payload;
                    // Обновляем данные участника во всех чатах
                    setChats(prev => prev.map(c => ({
                        ...c,
                        members: c.members.map(m =>
                            m.user_id !== updatedUser.id ? m : {
                                ...m,
                                display_name: updatedUser.display_name,
                                avatar_url: updatedUser.avatar_url,
                                public_keys: updatedUser.public_keys,
                            }
                        ),
                        // Обновляем имя чата если это личный чат
                        name: !c.is_group && c.members.some(m => m.user_id === updatedUser.id && m.user_id !== currentUserId)
                            ? updatedUser.display_name
                            : c.name,
                    })));
                    break;
                }

                case 'error': {
                    console.error('[WS] server error:', msg.payload.message);
                    break;
                }
            }
        });

        return unsubscribe;
    }, [user, currentUserId, loadChats, chats]);

    // ── При реконнекте WS — перезагружаем чаты ─────────────
    useEffect(() => {
        if (!user) return;

        const unsubscribe = wsManager.onStatusChange((connected) => {
            if (connected) {
                console.log('[Chat] WS reconnected, reloading chats...');
                loadChats();
            }
        });

        return unsubscribe;
    }, [user, loadChats]);

    // ── Начальная загрузка ─────────────────────────────────
    useEffect(() => {
        if (user) {
            loadChats();
        } else {
            setChats([]);
            setSelectedId(null);
        }
    }, [user, loadChats]);

    // ── Авто-выбор сохранённого чата ───────────────────────
    useEffect(() => {
        if (chats.length > 0 && selectedId) {
            const exists = chats.some(c => c.id === selectedId);
            if (exists) {
                const chat = chats.find(c => c.id === selectedId);
                if (chat && !chat.messagesLoaded) {
                    selectChat(selectedId);
                }
            } else {
                setSelectedId(null);
                saveSelectedId(null);
            }
        }
    }, [chats.length]);

    const selectedChat = chats.find(c => c.id === selectedId) ?? null;

    return {
        chats,
        selectedId,
        selectedChat,
        loadingChats,
        loadingMessages,
        selectChat,
        sendMessage,
        sendVoiceMessage,
        editMessage,
        deleteMessage,
        createChat,
        loadChats,
    };
}