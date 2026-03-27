import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Chat, Message, ContextMenuItem } from '../../types';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { ContextMenu } from '../ui/ContextMenu';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';

interface Props {
    chat: Chat;
    onSendMessage: (text: string) => void;
    onDeleteMessage: (msgId: string) => void;
    onEditMessage: (msgId: string, newText: string) => void;
    showToast: (text: string) => void;
}

export function ChatView({ chat, onSendMessage, onDeleteMessage, onEditMessage, showToast }: Props) {
    const [inputText, setInputText] = useState('');
    const [editingMsg, setEditingMsg] = useState<Message | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    /* Скролл вниз при новых сообщениях */
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat.messages.length, chat.id]);

    /* Сброс при смене чата */
    useEffect(() => {
        setInputText('');
        setEditingMsg(null);
        setCtxMenu(null);
    }, [chat.id]);

    /* Escape закрывает меню / отменяет редактирование */
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

    /* Отправка / сохранение редактирования */
    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text) return;

        if (editingMsg) {
            if (text !== editingMsg.text) {
                onEditMessage(editingMsg.id, text);
            }
            setEditingMsg(null);
        } else {
            onSendMessage(text);
        }
        setInputText('');
    }, [inputText, editingMsg, onSendMessage, onEditMessage]);

    /* Контекстное меню */
    const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, message: msg });
    };

    const ctxItems = (msg: Message): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        if (msg.own) {
            items.push({
                label: 'Редактировать',
                icon: Icon.edit(16),
                onClick: () => { setEditingMsg(msg); setInputText(msg.text); },
            });
        }
        items.push({
            label: 'Копировать',
            icon: Icon.copy(16),
            onClick: () => {
                navigator.clipboard.writeText(msg.text);
                showToast('Скопировано в буфер обмена');
            },
        });
        items.push({
            label: 'Удалить',
            icon: Icon.trash(16),
            danger: true,
            onClick: () => onDeleteMessage(msg.id),
        });
        return items;
    };

    return (
        <section className="chat-view">
            {/* ── Шапка ──────────────────────────────────── */}
            <div className="chat-header">
                <div className="chat-header-left">
                    <Avatar name={chat.name} size={38} online={chat.group ? undefined : chat.online} />
                    <div className="chat-header-info">
                        <h3>{chat.name}</h3>
                        <span className="chat-header-sub">
                            {chat.group
                                ? `${chat.messages.length} сообщений`
                                : chat.online ? 'в сети' : 'был(а) недавно'}
                        </span>
                    </div>
                </div>
                <div className="chat-header-actions">
                    <button
                        className="icon-btn"
                        title="Позвонить"
                        onClick={() => showToast('Звонки будут доступны после подключения к серверу')}
                    >
                        {Icon.phone(20)}
                    </button>
                    <button className="icon-btn" title="Поиск">
                        {Icon.search(20)}
                    </button>
                </div>
            </div>

            {/* ── Сообщения ──────────────────────────────── */}
            <div className="messages-scroll">
                <div className="messages-inner">
                    <div className="encryption-notice">
                        {Icon.lock(14)}
                        <span>Сообщения защищены сквозным шифрованием</span>
                    </div>

                    {chat.messages.map((msg, i) => {
                        const prev = chat.messages[i - 1];
                        const isFirst = !prev || prev.own !== msg.own || prev.author !== msg.author;
                        return (
                            <MessageBubble
                                key={msg.id}
                                message={msg}
                                isFirst={isFirst}
                                isGroup={chat.group}
                                onContextMenu={e => handleContextMenu(e, msg)}
                            />
                        );
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* ── Ввод ───────────────────────────────────── */}
            <InputBar
                value={inputText}
                onChange={setInputText}
                onSend={handleSend}
                editingMessage={editingMsg}
                onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
                onAttach={() => showToast('Файлы будут доступны после подключения к серверу')}
                onMic={() => showToast('Голосовые сообщения в разработке')}
            />

            {/* ── Контекстное меню ───────────────────────── */}
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