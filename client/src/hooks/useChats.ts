import { useState, useCallback, useEffect, useRef } from 'react';
import type { LocalChat, LocalMessage, WsServerMsg, ChatDto, MessageDto, UserDto } from '../types';
import * as api from '../api';
import { wsManager } from '../websocket';

const uid = () => Math.random().toString(36).slice(2, 10);

function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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

function chatDtoToLocal(dto: ChatDto, currentUserId: string): LocalChat {
    const otherMembers = dto.members.filter(m => m.user_id !== currentUserId);
    const name = dto.is_group
        ? (dto.name || 'Групповой чат')
        : (otherMembers[0]?.display_name || 'Чат');
    const online = dto.is_group ? false : (otherMembers[0]?.online || false);

    return {
        id: dto.id,
        is_group: dto.is_group,
        name,
        members: dto.members,
        messages: [],
        unread_count: dto.unread_count,
        online,
        created_at: dto.created_at,
    };
}

export function useChats(user: UserDto | null) {
    const [chats, setChats] = useState<LocalChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loadingChats, setLoadingChats] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const loadedMessages = useRef<Set<string>>(new Set());

    const currentUserId = user?.id || '';

    // ── Загрузка списка чатов ──────────────────────────────
    const loadChats = useCallback(async () => {
        if (!user) return;
        setLoadingChats(true);
        try {
            const serverChats = await api.getChats();
            setChats(serverChats.map(c => chatDtoToLocal(c, currentUserId)));
        } catch (e) {
            console.error('Failed to load chats', e);
        } finally {
            setLoadingChats(false);
        }
    }, [user, currentUserId]);

    // ── Загрузка сообщений при выборе чата ──────────────────
    const selectChat = useCallback(async (chatId: string) => {
        setSelectedId(chatId);

        if (!loadedMessages.current.has(chatId)) {
            setLoadingMessages(true);
            try {
                const msgs = await api.getMessages(chatId);
                const localMsgs = msgs.map(m => serverMsgToLocal(m, currentUserId));

                setChats(prev => prev.map(c =>
                    c.id !== chatId ? c : { ...c, messages: localMsgs, unread_count: 0 }
                ));

                loadedMessages.current.add(chatId);
            } catch (e) {
                console.error('Failed to load messages', e);
            } finally {
                setLoadingMessages(false);
            }
        } else {
            // Сбросить непрочитанные
            setChats(prev => prev.map(c =>
                c.id !== chatId ? c : { ...c, unread_count: 0 }
            ));
        }
    }, [currentUserId]);

    // ── Отправка сообщения ──────────────────────────────────
    const sendMessage = useCallback((text: string) => {
        if (!selectedId || !text.trim() || !user) return;

        const clientId = uid();
        const now = new Date().toISOString();

        // Оптимистичное добавление
        const pendingMsg: LocalMessage = {
            id: clientId,
            client_id: clientId,
            chat_id: selectedId,
            sender_id: user.id,
            sender_name: user.display_name,
            content: text,
            edited: false,
            created_at: now,
            own: true,
            status: 'pending',
        };

        setChats(prev => prev.map(c =>
            c.id !== selectedId ? c : {
                ...c,
                messages: [...c.messages, pendingMsg],
            }
        ));

        // Отправить через WS
        wsManager.send({
            type: 'send_message',
            payload: { chat_id: selectedId, content: text, client_id: clientId },
        });
    }, [selectedId, user]);

    // ── Редактирование ──────────────────────────────────────
    const editMessage = useCallback((messageId: string, newText: string) => {
        wsManager.send({
            type: 'edit_message',
            payload: { message_id: messageId, new_content: newText },
        });
    }, []);

    // ── Удаление ────────────────────────────────────────────
    const deleteMessage = useCallback((messageId: string) => {
        wsManager.send({
            type: 'delete_message',
            payload: { message_id: messageId },
        });
    }, []);

    // ── Создание чата ───────────────────────────────────────
    const createChat = useCallback(async (memberIds: string[], isGroup: boolean, name?: string) => {
        try {
            const newChat = await api.createChat(memberIds, isGroup, name);
            const local = chatDtoToLocal(newChat, currentUserId);
            setChats(prev => [local, ...prev]);
            setSelectedId(newChat.id);
            return newChat;
        } catch (e) {
            console.error('Failed to create chat', e);
            throw e;
        }
    }, [currentUserId]);

    // ── Typing ──────────────────────────────────────────────
    const sendTyping = useCallback((chatId: string) => {
        wsManager.send({ type: 'typing', payload: { chat_id: chatId } });
    }, []);

    const sendStopTyping = useCallback((chatId: string) => {
        wsManager.send({ type: 'stop_typing', payload: { chat_id: chatId } });
    }, []);

    // ── WebSocket events ───────────────────────────────────
    useEffect(() => {
        if (!user) return;

        const unsubscribe = wsManager.subscribe((msg: WsServerMsg) => {
            switch (msg.type) {
                case 'message_sent': {
                    // Наше сообщение подтверждено — заменяем pending на реальное
                    const { client_id, message } = msg.payload;
                    setChats(prev => prev.map(c =>
                        c.id !== message.chat_id ? c : {
                            ...c,
                            messages: c.messages.map(m =>
                                m.client_id === client_id
                                    ? { ...serverMsgToLocal(message, currentUserId), status: 'sent' as const }
                                    : m
                            ),
                        }
                    ));
                    break;
                }

                case 'new_message': {
                    // Сообщение от другого юзера
                    const { message } = msg.payload;
                    const localMsg = serverMsgToLocal(message, currentUserId);

                    setChats(prev => {
                        const chatExists = prev.some(c => c.id === message.chat_id);
                        if (!chatExists) {
                            // Новый чат — подгрузим позже
                            loadChats();
                            return prev;
                        }

                        return prev.map(c =>
                            c.id !== message.chat_id ? c : {
                                ...c,
                                messages: [...c.messages, localMsg],
                                unread_count: c.id === selectedId ? 0 : c.unread_count + 1,
                            }
                        );
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
    }, [user, currentUserId, selectedId, loadChats]);

    // Загрузить чаты при подключении
    useEffect(() => {
        if (user) loadChats();
    }, [user, loadChats]);

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
        sendTyping,
        sendStopTyping,
        loadChats,
    };
}