import React from 'react';
import type { Chat } from '../../types';
import { getLastMessage } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface Props {
    chats: Chat[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    search: string;
    onSearch: (q: string) => void;
    onNewChat: () => void;
}

export function ChatListPanel({ chats, selectedId, onSelect, search, onSearch, onNewChat }: Props) {
    const filtered = chats.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <aside className="chat-list-panel">
            <div className="panel-header">
                <h2>Чаты</h2>
                <button className="icon-btn" onClick={onNewChat} title="Новый чат">
                    {Icon.plus(20)}
                </button>
            </div>

            <div className="search-wrap">
                <span className="search-ico">{Icon.search(16)}</span>
                <input
                    type="text"
                    placeholder="Поиск..."
                    value={search}
                    onChange={e => onSearch(e.target.value)}
                />
            </div>

            <div className="chat-list">
                {filtered.map(chat => {
                    const last = getLastMessage(chat);
                    return (
                        <button
                            key={chat.id}
                            className={`chat-item ${selectedId === chat.id ? 'active' : ''}`}
                            onClick={() => onSelect(chat.id)}
                        >
                            <Avatar
                                name={chat.name}
                                size={46}
                                online={chat.group ? undefined : chat.online}
                            />
                            <div className="chat-item-body">
                                <div className="chat-item-row">
                                    <span className="chat-item-name">
                                        {chat.group && <span className="group-badge">{Icon.users(13)}</span>}
                                        {chat.name}
                                    </span>
                                    <span className="chat-item-time">{last.time}</span>
                                </div>
                                <div className="chat-item-row">
                                    <span className="chat-item-preview">{last.text}</span>
                                    <Badge count={chat.unread} />
                                </div>
                            </div>
                        </button>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="chat-list-empty">Ничего не найдено</div>
                )}
            </div>
        </aside>
    );
}