import React from 'react';
import type { Message } from '../../types';
import { getAvatarColor } from '../../utils';
import { MsgStatus } from '../ui/MsgStatus';

interface Props {
    message: Message;
    isFirst: boolean;
    isGroup: boolean;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function MessageBubble({ message, isFirst, isGroup, onContextMenu }: Props) {
    const showAuthor = isGroup && !message.own && isFirst;

    return (
        <div
            className={`msg ${message.own ? 'own' : ''} ${isFirst ? 'first' : ''}`}
            onContextMenu={onContextMenu}
        >
            {showAuthor && (
                <span className="msg-author" style={{ color: getAvatarColor(message.author) }}>
                    {message.author}
                </span>
            )}
            <div className="msg-bubble">
                <span className="msg-text">{message.text}</span>
                <div className="msg-meta">
                    {message.edited && <span className="msg-edited">ред.</span>}
                    <span className="msg-time">{message.time}</span>
                    {message.own && <MsgStatus status={message.status} />}
                </div>
            </div>
        </div>
    );
}