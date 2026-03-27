import React from 'react';
import type { LocalChat } from '../../types';
import { getChatPreview } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

interface Props {
    chats: LocalChat[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    search: string;
    onSearch: (q: string) => void;
    onNewChat: () => void;
    loading?: boolean;
    currentUserId?: string;
}

export function ChatListPanel({
    chats, selectedId, onSelect, search, onSearch, onNewChat, loading, currentUserId,
}: Props) {
    const filtered = chats.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    // Получаем аватарку чата (для личных — аватарка собеседника)
    const getChatAvatar = (chat: LocalChat): string | undefined => {
        if (chat.is_group) return undefined;
        const other = chat.members.find(m => m.user_id !== currentUserId);
        return other?.avatar_url || undefined;
    };

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
                {loading && chats.length === 0 && (
                    <div className="chat-list-empty">Загрузка чатов...</div>
                )}

                {filtered.map(chat => {
                    const preview = getChatPreview(chat);
                    const avatarUrl = getChatAvatar(chat);

                    return (
                        <button
                            key={chat.id}
                            className={`chat-item ${selectedId === chat.id ? 'active' : ''}`}
                            onClick={() => onSelect(chat.id)}
                        >
                            <Avatar
                                name={chat.name}
                                size={46}
                                online={chat.is_group ? undefined : chat.online}
                                avatarUrl={avatarUrl}
                            />
                            <div className="chat-item-body">
                                <div className="chat-item-row">
                                    <span className="chat-item-name">
                                        {chat.is_group && <span className="group-badge">{Icon.users(13)}</span>}
                                        {chat.name}
                                    </span>
                                    <span className="chat-item-time">{preview.time}</span>
                                </div>
                                <div className="chat-item-row">
                                    <span className="chat-item-preview">{preview.text || 'Нет сообщений'}</span>
                                    <Badge count={chat.unread_count} />
                                </div>
                            </div>
                        </button>
                    );
                })}

                {!loading && filtered.length === 0 && chats.length > 0 && (
                    <div className="chat-list-empty">Ничего не найдено</div>
                )}

                {!loading && chats.length === 0 && (
                    <div className="chat-list-empty">
                        Нет чатов. Нажмите + чтобы начать переписку
                    </div>
                )}
            </div>
        </aside>
    );
}