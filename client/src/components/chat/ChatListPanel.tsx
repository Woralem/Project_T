import React, { useState, useMemo } from 'react';
import type { LocalChat, ContextMenuItem } from '../../types';
import { getChatPreview } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { ContextMenu } from '../ui/ContextMenu';

interface Props {
    chats: LocalChat[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    search: string;
    onSearch: (q: string) => void;
    onNewChat: () => void;
    loading?: boolean;
    currentUserId?: string;
    onPinToggle?: (chatId: string) => void;
    onJoinByCode?: () => void;
}

export function ChatListPanel({
    chats, selectedId, onSelect, search, onSearch, onNewChat, loading, currentUserId, onPinToggle, onJoinByCode,
}: Props) {
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; chat: LocalChat } | null>(null);

    const sorted = useMemo(() => {
        const filtered = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
        return [...filtered].sort((a, b) => {
            // Закреплённые первыми
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            // Затем по времени последней активности (новые сверху)
            return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '');
        });
    }, [chats, search]);

    const getChatAvatar = (chat: LocalChat): string | undefined => {
        if (chat.is_group || chat.isChannel) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    const handleContextMenu = (e: React.MouseEvent, chat: LocalChat) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, chat });
    };

    const ctxItems = (chat: LocalChat): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        if (onPinToggle) {
            items.push({
                label: chat.isPinned ? 'Открепить' : 'Закрепить',
                icon: chat.isPinned ? Icon.x(16) : Icon.pin(16),
                onClick: () => onPinToggle(chat.id),
            });
        }
        return items;
    };

    return (
        <aside className="chat-list-panel">
            <div className="panel-header">
                <h2>Чаты</h2>
                <div style={{ display: 'flex', gap: 2 }}>
                    {onJoinByCode && (
                        <button className="icon-btn" onClick={onJoinByCode} title="Вступить по коду">
                            {Icon.link(20)}
                        </button>
                    )}
                    <button className="icon-btn" onClick={onNewChat} title="Новый чат">
                        {Icon.plus(20)}
                    </button>
                </div>
            </div>

            <div className="search-wrap">
                <span className="search-ico">{Icon.search(16)}</span>
                <input type="text" placeholder="Поиск..." value={search} onChange={e => onSearch(e.target.value)} />
            </div>

            <div className="chat-list">
                {loading && chats.length === 0 && <div className="chat-list-empty">Загрузка чатов...</div>}

                {sorted.map(chat => {
                    const preview = getChatPreview(chat);
                    const avatarUrl = getChatAvatar(chat);

                    return (
                        <button
                            key={chat.id}
                            className={`chat-item ${selectedId === chat.id ? 'active' : ''}`}
                            onClick={() => onSelect(chat.id)}
                            onContextMenu={e => handleContextMenu(e, chat)}
                        >
                            <Avatar name={chat.name} size={46} online={chat.is_group ? undefined : chat.online} avatarUrl={avatarUrl} />
                            <div className="chat-item-body">
                                <div className="chat-item-row">
                                    <span className="chat-item-name">
                                        {chat.isPinned && <span className="pin-indicator">📌</span>}
                                        {chat.isChannel && <span className="channel-badge">📢</span>}
                                        {chat.is_group && !chat.isChannel && <span className="group-badge">{Icon.users(13)}</span>}
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

                {!loading && sorted.length === 0 && chats.length > 0 && <div className="chat-list-empty">Ничего не найдено</div>}
                {!loading && chats.length === 0 && <div className="chat-list-empty">Нет чатов. Нажмите + чтобы начать</div>}
            </div>

            {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu.chat)} onClose={() => setCtxMenu(null)} />}
        </aside>
    );
}