import React, { useMemo } from 'react';
import type { LocalChat } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';

interface Props {
    chat: LocalChat;
    currentUserId: string;
    onClose: () => void;
    onOpenProfile: (userId: string) => void;
    onLeaveChat: () => void;
    onDeleteChat: () => void;
}

export function ChatInfoPanel({ chat, currentUserId, onClose, onOpenProfile, onLeaveChat, onDeleteChat }: Props) {
    const myRole = useMemo(() => chat.members.find(m => m.user_id === currentUserId)?.role || 'member', [chat, currentUserId]);
    const canDelete = myRole === 'owner';
    const avatarUrl = chat.is_group ? undefined : chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;

    const sharedImages = useMemo(() => {
        return chat.messages.filter(m => m.attachment && m.attachment.mime_type.startsWith('image/')).slice(-12).reverse();
    }, [chat.messages]);

    return (
        <aside className="chat-info-panel">
            <div className="cip-header">
                <h3>Информация</h3>
                <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
            </div>

            <div className="cip-avatar-section">
                <Avatar name={chat.name} size={80} avatarUrl={avatarUrl} />
                <h3 className="cip-name">{chat.name}</h3>
                <span className="cip-sub">{chat.is_group ? `${chat.members.length} участников` : chat.online ? 'в сети' : 'был(а) недавно'}</span>
            </div>

            {chat.is_group && (
                <div className="cip-section">
                    <div className="cip-section-label">Участники ({chat.members.length})</div>
                    <div className="cip-member-list">
                        {chat.members.map(m => (
                            <button key={m.user_id} className="cip-member" onClick={() => onOpenProfile(m.user_id)}>
                                <Avatar name={m.display_name} size={36} online={m.online} avatarUrl={m.avatar_url} />
                                <div className="cip-member-info">
                                    <span className="cip-member-name">{m.display_name}{m.user_id === currentUserId ? ' (вы)' : ''}</span>
                                    <span className="cip-member-role">{m.role === 'owner' ? 'Создатель' : 'Участник'}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {sharedImages.length > 0 && (
                <div className="cip-section">
                    <div className="cip-section-label">Медиа ({sharedImages.length})</div>
                    <div className="cip-media-grid">
                        {sharedImages.map(m => (
                            <div key={m.id} className="cip-media-thumb">
                                <img src={`http://163.5.180.138:3000/api/files/${m.attachment!.id}`} alt="" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="cip-section cip-actions">
                {chat.is_group && (
                    <button className="cip-action-btn danger" onClick={onLeaveChat}>
                        {Icon.leave(18)} Покинуть группу
                    </button>
                )}
                {canDelete && (
                    <button className="cip-action-btn danger" onClick={onDeleteChat}>
                        {Icon.trash(18)} Удалить чат
                    </button>
                )}
            </div>
        </aside>
    );
}