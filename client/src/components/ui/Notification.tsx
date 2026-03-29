import React from 'react';
import type { NotificationData } from '../../types';
import { Avatar } from './Avatar';
import { Icon } from '../../icons';

interface Props {
    notifications: NotificationData[];
    onClickNotification: (chatId: string) => void;
    onDismiss: (id: string) => void;
}

export function NotificationContainer({ notifications, onClickNotification, onDismiss }: Props) {
    if (!notifications.length) return null;

    return (
        <div className="notification-container">
            {notifications.map(n => (
                <NotificationItem
                    key={n.id}
                    notification={n}
                    onClick={() => { onClickNotification(n.chatId); onDismiss(n.id); }}
                    onDismiss={() => onDismiss(n.id)}
                />
            ))}
        </div>
    );
}

function NotificationItem({
    notification, onClick, onDismiss,
}: {
    notification: NotificationData;
    onClick: () => void;
    onDismiss: () => void;
}) {
    const { chatName, senderName, senderAvatarUrl, text, isGroup } = notification;
    const displayName = isGroup ? chatName : senderName;
    const previewText = isGroup ? `${senderName}: ${text}` : text;
    const truncated = previewText.length > 60 ? previewText.slice(0, 60) + '…' : previewText;

    return (
        <div className="notification-item" onClick={onClick}>
            <Avatar name={displayName} size={42} avatarUrl={senderAvatarUrl} />
            <div className="notification-body">
                <div className="notification-header">
                    <span className="notification-name">
                        {isGroup && <span className="notification-group-icon">{Icon.users(11)}</span>}
                        {displayName}
                    </span>
                    <span className="notification-label">Сейчас</span>
                </div>
                <span className="notification-text">{truncated}</span>
            </div>
            <button
                className="notification-close"
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
                {Icon.x(14)}
            </button>
        </div>
    );
}