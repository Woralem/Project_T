import React from 'react';
import type { LocalMessage } from '../../types';
import { getAvatarColor, formatTime } from '../../utils';
import { getFileUrl } from '../../api';
import { MsgStatus } from '../ui/MsgStatus';
import { AudioPlayer } from './AudioPlayer';

interface Props {
    message: LocalMessage;
    isFirst: boolean;
    isGroup: boolean;
    chatId: string;
    onContextMenu: (e: React.MouseEvent) => void;
}

export function MessageBubble({ message, isFirst, isGroup, chatId, onContextMenu }: Props) {
    const showAuthor = isGroup && !message.own && isFirst;
    const isPending = message.status === 'pending';
    const isVoice = message.attachment?.mime_type?.startsWith('audio/') || message.attachment?.mime_type === 'application/octet-stream';
    const isEncVoice = isVoice && message.encrypted?.nonce;

    const hasText = message.content &&
        message.content !== '🎤 Голосовое сообщение' &&
        message.content !== '[Зашифрованное сообщение]' &&
        message.content !== '🔒 Зашифровано';

    return (
        <div className={`msg ${message.own ? 'own' : ''} ${isFirst ? 'first' : ''} ${isPending ? 'pending' : ''}`} onContextMenu={onContextMenu}>
            {showAuthor && <span className="msg-author" style={{ color: getAvatarColor(message.sender_name) }}>{message.sender_name}</span>}
            <div className={`msg-bubble ${isVoice && !hasText ? 'voice-bubble' : ''}`}>
                {hasText && <span className="msg-text">{message.content}</span>}
                {isVoice && message.attachment && (
                    <AudioPlayer
                        src={getFileUrl(message.attachment.id)}
                        encryptedNonce={isEncVoice ? message.encrypted!.nonce : undefined}
                        chatId={isEncVoice ? chatId : undefined}
                        attachmentId={message.attachment.id}
                    />
                )}
                <div className="msg-meta">
                    {message.encrypted && <span className="msg-encrypted-badge" title="E2E">🔒</span>}
                    {message.edited && <span className="msg-edited">ред.</span>}
                    <span className="msg-time">{formatTime(message.created_at)}</span>
                    {message.own && <MsgStatus status={message.status} />}
                </div>
            </div>
        </div>
    );
}