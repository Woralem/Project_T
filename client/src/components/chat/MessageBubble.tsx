import React, { useState, useEffect, useRef } from 'react';
import type { LocalMessage, ActiveVoice } from '../../types';
import { getAvatarColor, formatTime } from '../../utils';
import { getFileUrl } from '../../api';
import { cryptoManager } from '../../crypto';
import { MsgStatus } from '../ui/MsgStatus';
import { AudioPlayer } from './AudioPlayer';
import { Icon } from '../../icons';

export interface MediaInfo {
    src: string; mediaType: 'image' | 'video'; filename?: string; chatId?: string; nonce?: string; attachmentId?: string;
}

interface Props {
    message: LocalMessage; isFirst: boolean; isGroup: boolean; chatId: string;
    onContextMenu: (e: React.MouseEvent) => void;
    onClickAuthor?: (userId: string) => void;
    onClickReply?: (messageId: string) => void;
    onOpenMedia?: (info: MediaInfo) => void;
    onVoiceActivate?: (v: ActiveVoice) => void;
    onVoiceDeactivate?: () => void;
}

function isImageMime(m: string) { return m.startsWith('image/'); }
function isVideoMime(m: string) { return m.startsWith('video/'); }
function isAudioMime(m: string) { return m.startsWith('audio/'); }
function formatFileSize(b: number) { if (b < 1024) return b + ' Б'; if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' КБ'; return (b / (1024 * 1024)).toFixed(1) + ' МБ'; }

function SecureImage({ src, chatId, nonce, attachmentId, onClick }: { src: string; chatId: string; nonce: string; attachmentId?: string; onClick?: () => void }) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const urlRef = useRef<string | null>(null);
    useEffect(() => {
        let c = false; setLoading(true); setError(false);
        (async () => {
            try { const r = await fetch(src); if (!r.ok) throw 0; const e = await r.arrayBuffer(); if (c) return; const d = await cryptoManager.decryptBuffer(chatId, e, nonce, attachmentId); if (c) return; const u = URL.createObjectURL(new Blob([d])); urlRef.current = u; setUrl(u); }
            catch { if (!c) setError(true); } finally { if (!c) setLoading(false); }
        })();
        return () => { c = true; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
    }, [src, chatId, nonce, attachmentId]);
    if (loading) return <div className="msg-image-loading">{Icon.lock(16)} Расшифровка…</div>;
    if (error) return <div className="msg-image-error">🔒 Не удалось расшифровать</div>;
    if (!url) return null;
    return <img src={url} alt="" className="msg-image" onClick={onClick} />;
}

async function triggerDownload(fileUrl: string, filename: string, chatId?: string, nonce?: string, attachmentId?: string) {
    try {
        const resp = await fetch(fileUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        let data = await resp.arrayBuffer();
        if (chatId && nonce && cryptoManager.hasChatKey(chatId)) data = await cryptoManager.decryptBuffer(chatId, data, nonce, attachmentId);
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    } catch (e) { console.error('Download failed:', e); }
}

export function MessageBubble({ message, isFirst, isGroup, chatId, onContextMenu, onClickAuthor, onClickReply, onOpenMedia, onVoiceActivate, onVoiceDeactivate }: Props) {
    const showAuthor = isGroup && !message.own && isFirst;
    const isPending = message.status === 'pending';
    const att = message.attachment;
    const isEncrypted = !!message.encrypted?.nonce;
    const isVoice = att && isAudioMime(att.mime_type) && att.filename.startsWith('voice');
    const isImage = att && isImageMime(att.mime_type);
    const isVideo = att && isVideoMime(att.mime_type);
    const isFile = att && !isVoice && !isImage && !isVideo;
    const hasText = message.content && message.content !== '🎤 Голосовое сообщение' && message.content !== '[Зашифрованное сообщение]' && message.content !== '🔒 Зашифровано' && !message.content.startsWith('📎 ');

    const handleAuthorClick = (e: React.MouseEvent) => { e.stopPropagation(); onClickAuthor?.(message.sender_id); };
    const handleReplyClick = () => { if (message.reply_to) onClickReply?.(message.reply_to.id); };
    const handleDownload = () => { if (!att) return; triggerDownload(getFileUrl(att.id), att.filename, isEncrypted ? chatId : undefined, isEncrypted ? message.encrypted!.nonce : undefined, att.id); };
    const handleOpenImage = () => { if (!att || !onOpenMedia) return; onOpenMedia({ src: getFileUrl(att.id), mediaType: 'image', filename: att.filename, chatId: isEncrypted ? chatId : undefined, nonce: isEncrypted ? message.encrypted!.nonce : undefined, attachmentId: att.id }); };
    const handleOpenVideo = () => { if (!att || !onOpenMedia) return; onOpenMedia({ src: getFileUrl(att.id), mediaType: 'video', filename: att.filename, chatId: isEncrypted ? chatId : undefined, nonce: isEncrypted ? message.encrypted!.nonce : undefined, attachmentId: att.id }); };

    return (
        <div className={`msg ${message.own ? 'own' : ''} ${isFirst ? 'first' : ''} ${isPending ? 'pending' : ''}`} onContextMenu={onContextMenu} id={`msg-${message.id}`}>
            {showAuthor && <span className="msg-author clickable-author" style={{ color: getAvatarColor(message.sender_name) }} onClick={handleAuthorClick}>{message.sender_name}</span>}
            {message.forwarded_from && <div className="msg-forward-header">{Icon.forward(12)}<span>Переслано от {message.forwarded_from.original_sender_name}</span></div>}
            <div className={`msg-bubble ${isVoice && !hasText ? 'voice-bubble' : ''}`}>
                {message.reply_to && (<div className="msg-reply-preview" onClick={handleReplyClick}><div className="msg-reply-line" /><div className="msg-reply-body"><span className="msg-reply-author" style={{ color: getAvatarColor(message.reply_to.sender_name) }}>{message.reply_to.sender_name}</span><span className="msg-reply-text">{message.reply_to.attachment ? `📎 ${message.reply_to.attachment.filename}` : message.reply_to.content.slice(0, 80)}</span></div></div>)}
                {hasText && <span className="msg-text">{message.content}</span>}
                {isImage && att && (<div className="msg-image-wrap">{isEncrypted ? <SecureImage src={getFileUrl(att.id)} chatId={chatId} nonce={message.encrypted!.nonce} attachmentId={att.id} onClick={handleOpenImage} /> : <img src={getFileUrl(att.id)} alt={att.filename} className="msg-image" onClick={handleOpenImage} />}</div>)}
                {isVideo && att && (<div className="msg-video-wrap" onClick={handleOpenVideo}>{isEncrypted ? (<div className="msg-video-encrypted"><div className="msg-video-play-icon">▶</div><span>Видео · {formatFileSize(att.size_bytes)}</span></div>) : (<><video src={getFileUrl(att.id)} className="msg-video" preload="metadata" muted /><div className="msg-video-play-overlay"><div className="msg-video-play-icon">▶</div></div></>)}</div>)}
                {isVoice && att && (<AudioPlayer src={getFileUrl(att.id)} encryptedNonce={isEncrypted ? message.encrypted!.nonce : undefined} chatId={isEncrypted ? chatId : undefined} attachmentId={att.id} senderName={message.sender_name} messageId={message.id} onActivate={onVoiceActivate} onDeactivate={onVoiceDeactivate} />)}
                {isFile && att && (<div className="msg-file-card" onClick={handleDownload}><div className="msg-file-icon">{Icon.file(28)}</div><div className="msg-file-info"><span className="msg-file-name">{att.filename}</span><span className="msg-file-size">{formatFileSize(att.size_bytes)}</span></div><div className="msg-file-dl">{Icon.download(18)}</div></div>)}
                <div className="msg-meta">{message.encrypted && <span className="msg-encrypted-badge" title="E2E">🔒</span>}{message.edited && <span className="msg-edited">ред.</span>}<span className="msg-time">{formatTime(message.created_at)}</span>{message.own && <MsgStatus status={message.status} />}</div>
            </div>
        </div>
    );
}