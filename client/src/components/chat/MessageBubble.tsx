import React from 'react';
import type { LocalMessage } from '../../types';
import { getAvatarColor, formatTime } from '../../utils';
import { MsgStatus } from '../ui/MsgStatus';

interface Props {
    message: LocalMessage;
    isFirst: boolean;
    isGroup: boolean;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function MessageBubble({ message, isFirst, isGroup, onContextMenu }: Props) {
    const showAuthor = isGroup && !message.own && isFirst;
    const isPending = message.status === 'pending';

    return (
        <div
            className={`msg ${message.own ? 'own' : ''} ${isFirst ? 'first' : ''} ${isPending ? 'pending' : ''}`}
            onContextMenu={onContextMenu}
        >
            {showAuthor && (
                <span className="msg-author" style={{ color: getAvatarColor(message.sender_name) }}>
                    {message.sender_name}
                </span>
            )}
            <div className="msg-bubble">
                <span className="msg-text">{message.content}</span>
                <div className="msg-meta">
                    {message.edited && <span className="msg-edited">ред.</span>}
                    <span className="msg-time">{formatTime(message.created_at)}</span>
                    {message.own && <MsgStatus status={message.status} />}
                </div>
            </div>
        </div>
    );
}