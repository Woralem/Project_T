import { useState, useCallback, useEffect, useRef } from 'react';
import type { LocalChat, LocalMessage, WsServerMsg, ChatDto, MessageDto, UserDto } from '../types';
import { formatTime, uid } from '../utils';
import * as api from '../api';
import { wsManager } from '../websocket';

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
//  Hook
// ═══════════════════════════════════════════════════════════

export function useChats(user: UserDto | null) {
    const [chats, setChats] = useState<LocalChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(loadSelectedId);
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Ref чтобы избежать повторной загрузки
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
                // Мержим с текущими — сохраняем загруженные сообщения
                const existingMap = new Map(prev.map(c => [c.id, c]));

                return serverChats.map(dto => {
                    const existing = existingMap.get(dto.id);
                    const fresh = chatDtoToLocal(dto, currentUserId);

                    if (existing && existing.messagesLoaded) {
                        // Сохраняем загруженные сообщения
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

        // Сбросить непрочитанные
        setChats(prev => prev.map(c =>
            c.id !== chatId ? c : { ...c, unread_count: 0 }
        ));

        // Проверяем нужно ли загружать сообщения
        const chat = chats.find(c => c.id === chatId);
        if (chat?.messagesLoaded) return;

        setLoadingMessages(true);
        try {
            const msgs = await api.getMessages(chatId);
            const localMsgs = msgs.map(m => serverMsgToLocal(m, currentUserId));

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

    // ── Отправка сообщения ──────────────────────────────────
    const sendMessage = useCallback((text: string) => {
        if (!selectedId || !text.trim() || !user) return;

        const trimmed = text.trim();
        const clientId = uid();
        const now = new Date().toISOString();

        // Оптимистичное добавление
        const pendingMsg: LocalMessage = {
            id: clientId,
            client_id: clientId,
            chat_id: selectedId,
            sender_id: user.id,
            sender_name: user.display_name,
            content: trimmed,
            edited: false,
            created_at: now,
            own: true,
            status: 'pending',
        };

        setChats(prev => prev.map(c =>
            c.id !== selectedId ? c : {
                ...c,
                messages: [...c.messages, pendingMsg],
                lastMessageText: 'Вы: ' + trimmed,
                lastMessageTime: formatTime(now),
            }
        ));

        const sent = wsManager.send({
            type: 'send_message',
            payload: { chat_id: selectedId, content: trimmed, client_id: clientId },
        });

        // Если WS не подключен — помечаем как failed
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
    }, [selectedId, user]);

    // ── Редактирование ──────────────────────────────────────
    const editMessage = useCallback((messageId: string, newText: string) => {
        if (!newText.trim()) return;

        // Оптимистичное обновление
        setChats(prev => prev.map(c => ({
            ...c,
            messages: c.messages.map(m =>
                m.id !== messageId ? m : { ...m, content: newText.trim(), edited: true }
            ),
        })));

        wsManager.send({
            type: 'edit_message',
            payload: { message_id: messageId, new_content: newText.trim() },
        });
    }, []);

    // ── Удаление ────────────────────────────────────────────
    const deleteMessage = useCallback((messageId: string) => {
        // Оптимистичное удаление
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

            setChats(prev => {
                // Проверяем нет ли уже этого чата в списке
                const exists = prev.find(c => c.id === newChat.id);
                if (exists) {
                    // Чат уже есть — просто выбираем его
                    return prev;
                }
                return [chatDtoToLocal(newChat, currentUserId), ...prev];
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

        const unsubscribe = wsManager.subscribe((msg: WsServerMsg) => {
            switch (msg.type) {
                case 'message_sent': {
                    const { client_id, message } = msg.payload;
                    setChats(prev => prev.map(c =>
                        c.id !== message.chat_id ? c : {
                            ...c,
                            messages: c.messages.map(m =>
                                m.client_id === client_id
                                    ? {
                                        ...serverMsgToLocal(message, currentUserId),
                                        status: 'sent' as const,
                                    }
                                    : m
                            ),
                            lastMessageText: 'Вы: ' + message.content,
                            lastMessageTime: formatTime(message.created_at),
                        }
                    ));
                    break;
                }

                case 'new_message': {
                    const { message } = msg.payload;

                    setChats(prev => {
                        const chatExists = prev.some(c => c.id === message.chat_id);
                        if (!chatExists) {
                            loadChats();
                            return prev;
                        }

                        return prev.map(c => {
                            if (c.id !== message.chat_id) return c;

                            // Защита от дубликатов
                            if (c.messages.some(m => m.id === message.id)) return c;

                            const localMsg = serverMsgToLocal(message, currentUserId);
                            const isSelected = selectedIdRef.current === c.id;
                            const senderPrefix = c.is_group ? `${message.sender_name}: ` : '';

                            return {
                                ...c,
                                messages: c.messagesLoaded ? [...c.messages, localMsg] : c.messages,
                                unread_count: isSelected ? 0 : c.unread_count + 1,
                                lastMessageText: senderPrefix + message.content,
                                lastMessageTime: formatTime(message.created_at),
                            };
                        });
                    });
                    break;
                }

                case 'message_edited': {
                    const { chat_id, message_id, new_content } = msg.payload;
                    setChats(prev => prev.map(c =>
                        c.id !== chat_id ? c : {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id !== message_id ? m : { ...m, content: new_content, edited: true }
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

                case 'error': {
                    console.error('[WS] server error:', msg.payload.message);
                    break;
                }
            }
        });

        return unsubscribe;
    }, [user, currentUserId, loadChats]);

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
                // Если чат есть но сообщения не загружены — загрузить
                const chat = chats.find(c => c.id === selectedId);
                if (chat && !chat.messagesLoaded) {
                    selectChat(selectedId);
                }
            } else {
                setSelectedId(null);
                saveSelectedId(null);
            }
        }
    }, [chats.length]); // Только при изменении количества чатов

    const selectedChat = chats.find(c => c.id === selectedId) ?? null;

    return {
        chats,
        selectedId,
        selectedChat,
        loadingChats,
        loadingMessages,
        selectChat,
        sendMessage,
        editMessage,
        deleteMessage,
        createChat,
        loadChats,
    };
}