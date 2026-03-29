import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LocalChat, LocalMessage, ContextMenuItem } from '../../types';
import { formatTime } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { ContextMenu } from '../ui/ContextMenu';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';
import { ChatSecurityBanner } from './ChatSecurityBanner';

interface Props {
    chat: LocalChat;
    currentUserId: string;
    loadingMessages?: boolean;
    onSendMessage: (text: string) => void;
    onSendVoice: (chatId: string, blob: Blob) => void;
    onDeleteMessage: (msgId: string) => void;
    onEditMessage: (msgId: string, newText: string) => void;
    onRefreshChat: (chatId: string) => void;
    onStartCall: (chatId: string) => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatView({
    chat, currentUserId, loadingMessages, onSendMessage, onSendVoice,
    onDeleteMessage, onEditMessage, onRefreshChat, onStartCall, showToast,
}: Props) {
    const [inputText, setInputText] = useState('');
    const [editingMsg, setEditingMsg] = useState<LocalMessage | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: LocalMessage } | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const getChatAvatar = (): string | undefined => {
        if (chat.is_group) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.messages.length, chat.id]);
    useEffect(() => { setInputText(''); setEditingMsg(null); setCtxMenu(null); }, [chat.id]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (ctxMenu) setCtxMenu(null);
                else if (editingMsg) { setEditingMsg(null); setInputText(''); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu, editingMsg]);

    const handleSend = useCallback(() => {
        const t = inputText.trim();
        if (!t) return;
        if (editingMsg) {
            if (t !== editingMsg.content) onEditMessage(editingMsg.id, t);
            setEditingMsg(null);
        } else {
            onSendMessage(t);
        }
        setInputText('');
    }, [inputText, editingMsg, onSendMessage, onEditMessage]);

    const handleSendVoice = useCallback((blob: Blob) => {
        onSendVoice(chat.id, blob);
    }, [chat.id, onSendVoice]);

    const handleContextMenu = (e: React.MouseEvent, msg: LocalMessage) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, message: msg });
    };

    const ctxItems = (msg: LocalMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        if (msg.own && msg.status !== 'pending') {
            items.push({
                label: 'Редактировать', icon: Icon.edit(16),
                onClick: () => { setEditingMsg(msg); setInputText(msg.content); },
            });
        }
        items.push({
            label: 'Копировать', icon: Icon.copy(16),
            onClick: () => { navigator.clipboard.writeText(msg.content); showToast('Скопировано'); },
        });
        if (msg.own) {
            items.push({
                label: 'Удалить', icon: Icon.trash(16), danger: true,
                onClick: () => onDeleteMessage(msg.id),
            });
        }
        return items;
    };

    const handleRefresh = useCallback(() => {
        onRefreshChat(chat.id);
    }, [onRefreshChat, chat.id]);

    const handleCall = useCallback(() => {
        if (chat.is_group) {
            showToast('Групповые звонки пока не поддерживаются', 'info');
            return;
        }
        onStartCall(chat.id);
    }, [chat.id, chat.is_group, onStartCall, showToast]);

    return (
        <section className="chat-view">
            <div className="chat-header">
                <div className="chat-header-left">
                    <Avatar name={chat.name} size={38} online={chat.is_group ? undefined : chat.online} avatarUrl={getChatAvatar()} />
                    <div className="chat-header-info">
                        <h3>{chat.name}</h3>
                        <span className="chat-header-sub">
                            {chat.is_group ? `${chat.members.length} участников` : chat.online ? 'в сети' : 'был(а) недавно'}
                        </span>
                    </div>
                </div>
                <div className="chat-header-actions">
                    <button className="icon-btn" title="Позвонить" onClick={handleCall}>
                        {Icon.phone(20)}
                    </button>
                    <button className="icon-btn" title="Поиск">{Icon.search(20)}</button>
                </div>
            </div>

            <ChatSecurityBanner
                chat={chat}
                currentUserId={currentUserId}
                onRefresh={handleRefresh}
                showToast={showToast}
            />

            <div className="messages-scroll">
                <div className="messages-inner">
                    <div className="encryption-notice">{Icon.lock(14)}<span>Сообщения защищены сквозным шифрованием</span></div>
                    {loadingMessages && chat.messages.length === 0 && <div className="messages-loading">Загрузка сообщений...</div>}
                    {!loadingMessages && chat.messagesLoaded && chat.messages.length === 0 && <div className="messages-loading">Нет сообщений. Напишите первое!</div>}

                    {chat.messages.map((msg, i) => {
                        const prev = chat.messages[i - 1];
                        const isFirst = !prev || prev.own !== msg.own || prev.sender_id !== msg.sender_id;
                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isFirst={isFirst}
                                isGroup={chat.is_group}
                                chatId={chat.id}
                                onContextMenu={e => handleContextMenu(e, msg)}
                            />
                        );
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            <InputBar
                value={inputText} onChange={setInputText} onSend={handleSend} onSendVoice={handleSendVoice}
                editingMessage={editingMsg ? { id: editingMsg.id, text: editingMsg.content, author: editingMsg.sender_name, time: formatTime(editingMsg.created_at), own: editingMsg.own } : null}
                onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
                onAttach={() => showToast('Файлы будут доступны после обновления')}
            />

            {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu.message)} onClose={() => setCtxMenu(null)} />}
        </section>
    );
}