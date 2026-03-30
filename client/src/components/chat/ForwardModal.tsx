import React, { useState } from 'react';
import type { LocalChat, LocalMessage } from '../../types';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';

interface Props {
    open: boolean;
    message: LocalMessage | null;
    chats: LocalChat[];
    currentUserId: string;
    onForward: (msg: LocalMessage, targetChatId: string) => void;
    onClose: () => void;
}

export function ForwardModal({ open, message, chats, currentUserId, onForward, onClose }: Props) {
    const [search, setSearch] = useState('');

    if (!open || !message) return null;

    const filtered = chats.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const getChatAvatar = (chat: LocalChat): string | undefined => {
        if (chat.is_group) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    const handleSelect = (chatId: string) => {
        onForward(message, chatId);
        onClose();
    };

    const previewText = message.attachment
        ? `📎 ${message.attachment.filename}`
        : message.content.length > 60
            ? message.content.slice(0, 60) + '…'
            : message.content;

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal-card modal-wide" onMouseDown={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Переслать сообщение</h3>
                    <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
                </div>

                <div className="forward-preview">
                    <div className="forward-preview-line" />
                    <div className="forward-preview-body">
                        <span className="forward-preview-author">{message.sender_name}</span>
                        <span className="forward-preview-text">{previewText}</span>
                    </div>
                </div>

                <div className="search-wrap" style={{ padding: '12px 0' }}>
                    <span className="search-ico">{Icon.search(16)}</span>
                    <input type="text" placeholder="Поиск чата..." value={search}
                        onChange={e => setSearch(e.target.value)} autoFocus />
                </div>

                <div className="user-list">
                    {filtered.map(chat => (
                        <button key={chat.id} className="chat-item" onClick={() => handleSelect(chat.id)}>
                            <Avatar name={chat.name} size={40} online={chat.is_group ? undefined : chat.online} avatarUrl={getChatAvatar(chat)} />
                            <div className="chat-item-body">
                                <span className="chat-item-name">
                                    {chat.is_group && <span className="group-badge">{Icon.users(13)}</span>}
                                    {chat.name}
                                </span>
                            </div>
                        </button>
                    ))}
                    {filtered.length === 0 && <div className="chat-list-empty">Чаты не найдены</div>}
                </div>
            </div>
        </div>
    );
}