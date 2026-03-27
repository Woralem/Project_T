import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LocalChat, LocalMessage, ContextMenuItem } from '../../types';
import { formatTime } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { ContextMenu } from '../ui/ContextMenu';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';

interface Props {
    chat: LocalChat;
    loadingMessages?: boolean;
    onSendMessage: (text: string) => void;
    onDeleteMessage: (msgId: string) => void;
    onEditMessage: (msgId: string, newText: string) => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatView({
    chat, loadingMessages, onSendMessage, onDeleteMessage, onEditMessage, showToast,
}: Props) {
    const [inputText, setInputText] = useState('');
    const [editingMsg, setEditingMsg] = useState<LocalMessage | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: LocalMessage } | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Скролл вниз при новых сообщениях
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat.messages.length, chat.id]);

    // Сброс при смене чата
    useEffect(() => {
        setInputText('');
        setEditingMsg(null);
        setCtxMenu(null);
    }, [chat.id]);

    // Escape
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
        const text = inputText.trim();
        if (!text) return;

        if (editingMsg) {
            if (text !== editingMsg.content) {
                onEditMessage(editingMsg.id, text);
            }
            setEditingMsg(null);
        } else {
            onSendMessage(text);
        }
        setInputText('');
    }, [inputText, editingMsg, onSendMessage, onEditMessage]);

    const handleContextMenu = (e: React.MouseEvent, msg: LocalMessage) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, message: msg });
    };

    const ctxItems = (msg: LocalMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        if (msg.own && msg.status !== 'pending') {
            items.push({
                label: 'Редактировать',
                icon: Icon.edit(16),
                onClick: () => { setEditingMsg(msg); setInputText(msg.content); },
            });
        }
        items.push({
            label: 'Копировать',
            icon: Icon.copy(16),
            onClick: () => {
                navigator.clipboard.writeText(msg.content);
                showToast('Скопировано в буфер обмена');
            },
        });
        if (msg.own) {
            items.push({
                label: 'Удалить',
                icon: Icon.trash(16),
                danger: true,
                onClick: () => onDeleteMessage(msg.id),
            });
        }
        return items;
    };

    return (
        <section className="chat-view">
            {/* Шапка */}
            <div className="chat-header">
                <div className="chat-header-left">
                    <Avatar name={chat.name} size={38} online={chat.is_group ? undefined : chat.online} />
                    <div className="chat-header-info">
                        <h3>{chat.name}</h3>
                        <span className="chat-header-sub">
                            {chat.is_group
                                ? `${chat.members.length} участников`
                                : chat.online ? 'в сети' : 'был(а) недавно'}
                        </span>
                    </div>
                </div>
                <div className="chat-header-actions">
                    <button className="icon-btn" title="Позвонить"
                        onClick={() => showToast('Звонки будут доступны позже')}>
                        {Icon.phone(20)}
                    </button>
                    <button className="icon-btn" title="Поиск">
                        {Icon.search(20)}
                    </button>
                </div>
            </div>

            {/* Сообщения */}
            <div className="messages-scroll">
                <div className="messages-inner">
                    <div className="encryption-notice">
                        {Icon.lock(14)}
                        <span>Сообщения защищены сквозным шифрованием</span>
                    </div>

                    {loadingMessages && chat.messages.length === 0 && (
                        <div className="messages-loading">Загрузка сообщений...</div>
                    )}

                    {!loadingMessages && chat.messagesLoaded && chat.messages.length === 0 && (
                        <div className="messages-loading">Нет сообщений. Напишите первое!</div>
                    )}

                    {chat.messages.map((msg, i) => {
                        const prev = chat.messages[i - 1];
                        const isFirst = !prev || prev.own !== msg.own || prev.sender_id !== msg.sender_id;
                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isFirst={isFirst}
                                isGroup={chat.is_group}
                                onContextMenu={e => handleContextMenu(e, msg)}
                            />
                        );
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Ввод */}
            <InputBar
                value={inputText}
                onChange={setInputText}
                onSend={handleSend}
                editingMessage={editingMsg ? {
                    id: editingMsg.id,
                    author: editingMsg.sender_name,
                    text: editingMsg.content,
                    time: formatTime(editingMsg.created_at),
                    own: editingMsg.own,
                } : null}
                onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
                onAttach={() => showToast('Файлы будут доступны после обновления')}
                onMic={() => showToast('Голосовые сообщения в разработке')}
            />

            {/* Контекстное меню */}
            {ctxMenu && (
                <ContextMenu
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    items={ctxItems(ctxMenu.message)}
                    onClose={() => setCtxMenu(null)}
                />
            )}
        </section>
    );
}