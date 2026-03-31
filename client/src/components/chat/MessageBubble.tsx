import React, { useState, useRef, useEffect } from 'react';
import { Lock, Check, CheckCheck, Download, Play, Pause, Loader2, Eye, CornerUpRight, Reply } from 'lucide-react';
import type { LocalMessage, AttachmentDto, ReplyInfoDto, ForwardInfoDto } from '../../types';
import { formatTime, formatFileSize, getMediaType, getFileIcon, getAvatarColor } from '../../utils';
import { getFileUrl } from '../../api';
import { useAudioStore } from '../../store/useAudioStore';
import { MediaViewer } from '../ui/MediaViewer';
import { cryptoManager } from '../../crypto';

interface Props {
    message: LocalMessage;
    isFirst: boolean;
    isGroup: boolean;
    onReply?: (msg: LocalMessage) => void;
}

export function MessageBubble({ message: msg, isFirst, isGroup, onReply }: Props) {
    const time = formatTime(msg.created_at);
    const att = msg.attachment;
    const mediaType = att ? getMediaType(att.mime_type, att.filename) : null;

    const fileNonce = msg.encrypted?.file_nonce;
    const isTextEncrypted = !!(msg.encrypted?.ciphertext && msg.encrypted.ciphertext.length > 0);

    return (
        <div className={`flex flex-col max-w-[75%] sm:max-w-[65%] ${msg.own ? 'items-end' : 'items-start'}`}>
            {isGroup && !msg.own && isFirst && (
                <span className="text-xs font-semibold mb-0.5 pl-1" style={{ color: getAvatarColor(msg.sender_name) }}>
                    {msg.sender_name}
                </span>
            )}
            <div className={`relative flex flex-col shadow-sm overflow-hidden ${msg.own ? 'bg-accent text-white rounded-2xl rounded-br-[4px]' : 'bg-white dark:bg-[#1e1e2a] text-gray-900 dark:text-[#e4e4ec] rounded-2xl rounded-bl-[4px]'
                } ${msg.status === 'pending' ? 'opacity-60' : ''} ${att && (mediaType === 'image' || mediaType === 'video') ? '' : 'px-3 py-2'}`}>

                {msg.forwarded_from && (
                    <ForwardedHeader info={msg.forwarded_from} own={msg.own} />
                )}

                {msg.reply_to && (
                    <ReplyPreview reply={msg.reply_to} own={msg.own} />
                )}

                {att && mediaType === 'image' && (
                    <ImagePreview att={att} own={msg.own} chatId={msg.chat_id} fileNonce={fileNonce} />
                )}
                {att && mediaType === 'video' && (
                    <VideoPreview att={att} own={msg.own} chatId={msg.chat_id} fileNonce={fileNonce} />
                )}
                {att && mediaType === 'audio' && (
                    <AudioAttachment att={att} own={msg.own} senderName={msg.sender_name} messageId={msg.id} chatId={msg.chat_id} fileNonce={fileNonce} />
                )}
                {att && mediaType === 'file' && (
                    <FileAttachment att={att} own={msg.own} chatId={msg.chat_id} fileNonce={fileNonce} />
                )}

                {msg.content && msg.content !== '📎 Файл' && msg.content !== '' && msg.content !== '[Зашифрованное сообщение]' && (
                    <span className={`text-[14px] leading-[1.45] break-words whitespace-pre-wrap ${att && (mediaType === 'image' || mediaType === 'video') ? 'px-3 pt-1' : ''
                        }`}>
                        {msg.content}
                    </span>
                )}

                <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${att && (mediaType === 'image' || mediaType === 'video') ? 'px-3 pb-2' : ''
                    } ${msg.own ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
                    {isTextEncrypted && <Lock size={10} className="opacity-70" />}
                    {fileNonce && !isTextEncrypted && <Lock size={10} className="opacity-50" />}
                    {msg.edited && <span className="italic opacity-80">ред.</span>}
                    <span className="opacity-80">{time}</span>
                    {msg.own && (
                        <span className={`inline-flex ${msg.status === 'read' ? 'text-blue-300' : 'opacity-80'}`}>
                            {msg.status === 'sent' ? <Check size={14} /> : <CheckCheck size={14} />}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══ Forwarded Header ═══

function ForwardedHeader({ info, own }: { info: ForwardInfoDto; own: boolean }) {
    return (
        <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-1 ${own ? 'text-white/60' : 'text-gray-400'}`}>
            <CornerUpRight size={12} />
            <span>Переслано от <strong className={own ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}>{info.original_sender_name}</strong></span>
        </div>
    );
}

// ═══ Reply Preview ═══

function ReplyPreview({ reply, own }: { reply: ReplyInfoDto; own: boolean }) {
    const isEnc = reply.content === '🔒 Зашифровано';
    const preview = reply.attachment
        ? `📎 ${reply.attachment.filename}`
        : reply.content.length > 80
            ? reply.content.slice(0, 80) + '…'
            : reply.content;

    return (
        <div className={`flex gap-2 mb-1.5`}>
            <div className={`w-0.5 rounded-full flex-shrink-0 ${own ? 'bg-white/40' : 'bg-accent'}`} />
            <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-bold ${own ? 'text-white/80' : 'text-accent'}`}>
                    {reply.sender_name}
                </div>
                <div className={`text-[12px] truncate ${own ? 'text-white/60' : 'text-gray-500'} ${isEnc ? 'italic' : ''}`}>
                    {isEnc && <Lock size={9} className="inline mr-1" />}
                    {preview}
                </div>
            </div>
        </div>
    );
}

// ═══ Image Preview ═══

function ImagePreview({ att, own, chatId, fileNonce }: {
    att: AttachmentDto; own: boolean; chatId: string; fileNonce?: string;
}) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [decryptedThumb, setDecryptedThumb] = useState<string | null>(null);
    const url = getFileUrl(att.id);
    const isE2E = !!fileNonce;

    useEffect(() => {
        if (!isE2E) return;
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(url);
                const encData = await resp.arrayBuffer();
                if (cancelled) return;
                const decData = await cryptoManager.decryptBuffer(chatId, encData, fileNonce!);
                if (cancelled) return;
                const blobUrl = URL.createObjectURL(new Blob([decData], { type: att.mime_type }));
                setDecryptedThumb(blobUrl);
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        return () => { cancelled = true; };
    }, [url, isE2E, chatId, fileNonce, att.mime_type]);

    useEffect(() => {
        return () => { if (decryptedThumb) URL.revokeObjectURL(decryptedThumb); };
    }, [decryptedThumb]);

    const displayUrl = isE2E ? decryptedThumb : url;

    return (
        <>
            <div className="relative min-w-[200px] max-w-[400px] cursor-pointer group" onClick={() => setViewerOpen(true)}>
                {!loaded && !error && !displayUrl && (
                    <div className="w-full h-[200px] flex items-center justify-center bg-black/5 dark:bg-white/5">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                    </div>
                )}
                {error && (
                    <div className="w-full h-[100px] flex items-center justify-center bg-black/5 dark:bg-white/5 text-gray-400 text-[13px]">
                        🔒 Не удалось расшифровать
                    </div>
                )}
                {displayUrl && (
                    <>
                        {!loaded && (
                            <div className="w-full h-[200px] flex items-center justify-center bg-black/5 dark:bg-white/5">
                                <Loader2 size={24} className="animate-spin text-gray-400" />
                            </div>
                        )}
                        <img
                            src={displayUrl}
                            alt={att.filename}
                            className={`w-full rounded-t-2xl object-cover max-h-[400px] ${loaded ? '' : 'hidden'}`}
                            onLoad={() => setLoaded(true)}
                            onError={() => setError(true)}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                            <Eye size={28} className="text-white opacity-0 group-hover:opacity-80 transition drop-shadow" />
                        </div>
                    </>
                )}
                {isE2E && loaded && (
                    <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-sm text-white/80 text-[10px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <Lock size={9} /> E2E
                    </div>
                )}
            </div>

            {viewerOpen && displayUrl && (
                <MediaViewer
                    src={isE2E ? url : displayUrl}
                    mediaType="image"
                    filename={att.filename}
                    chatId={isE2E ? chatId : undefined}
                    fileNonce={isE2E ? fileNonce : undefined}
                    onClose={() => setViewerOpen(false)}
                />
            )}
        </>
    );
}

// ═══ Video Preview ═══

function VideoPreview({ att, own, chatId, fileNonce }: {
    att: AttachmentDto; own: boolean; chatId: string; fileNonce?: string;
}) {
    const [viewerOpen, setViewerOpen] = useState(false);
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const url = getFileUrl(att.id);
    const isE2E = !!fileNonce;

    useEffect(() => {
        if (!isE2E) return;
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(url);
                const enc = await resp.arrayBuffer();
                if (cancelled) return;
                const dec = await cryptoManager.decryptBuffer(chatId, enc, fileNonce!);
                if (cancelled) return;
                setDecryptedUrl(URL.createObjectURL(new Blob([dec], { type: att.mime_type })));
            } catch { /* */ }
        })();
        return () => { cancelled = true; };
    }, [url, isE2E, chatId, fileNonce, att.mime_type]);

    useEffect(() => { return () => { if (decryptedUrl) URL.revokeObjectURL(decryptedUrl); }; }, [decryptedUrl]);

    const displayUrl = isE2E ? decryptedUrl : url;

    return (
        <>
            <div className="relative min-w-[200px] max-w-[400px] cursor-pointer" onClick={() => setViewerOpen(true)}>
                {displayUrl ? (
                    <video src={displayUrl} className="w-full rounded-t-2xl max-h-[300px]" preload="metadata" />
                ) : (
                    <div className="w-full h-[200px] flex items-center justify-center bg-black/5 dark:bg-white/5">
                        <Loader2 size={24} className="animate-spin text-gray-400" />
                    </div>
                )}
            </div>

            {viewerOpen && (
                <MediaViewer
                    src={isE2E ? url : (displayUrl || url)}
                    mediaType="video"
                    filename={att.filename}
                    chatId={isE2E ? chatId : undefined}
                    fileNonce={isE2E ? fileNonce : undefined}
                    onClose={() => setViewerOpen(false)}
                />
            )}
        </>
    );
}

// ═══ Audio — с поддержкой E2E ═══

function AudioAttachment({ att, own, senderName, messageId, chatId, fileNonce }: {
    att: AttachmentDto; own: boolean; senderName: string; messageId: string; chatId: string; fileNonce?: string;
}) {
    const { play, fileId, playing } = useAudioStore();
    const isActive = fileId === att.id;
    const isVoice = att.filename.startsWith('voice_');
    const name = isVoice ? '🎤 Голосовое' : `🎵 ${att.filename.replace(/\.[^.]+$/, '')}`;

    return (
        <div className="flex items-center gap-2.5 min-w-[200px]">
            <button
                onClick={() => play({ fileId: att.id, fileName: att.filename, senderName, messageId, chatId, fileNonce })}
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-90 ${own ? 'bg-white/20 hover:bg-white/30' : 'bg-accent/10 hover:bg-accent/20 text-accent'
                    } ${isActive ? 'ring-2 ring-accent ring-offset-1' : ''}`}
            >
                {isActive && playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate opacity-80">{name}</div>
                <div className="flex items-center gap-1 text-[11px] opacity-50">
                    <span>{formatFileSize(att.size_bytes)}</span>
                    {fileNonce && <><Lock size={9} /> <span>E2E</span></>}
                </div>
            </div>
        </div>
    );
}

// ═══ File with E2E ═══

function FileAttachment({ att, own, chatId, fileNonce }: {
    att: AttachmentDto; own: boolean; chatId: string; fileNonce?: string;
}) {
    const [downloading, setDownloading] = useState(false);
    const isE2E = !!fileNonce;

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const resp = await fetch(getFileUrl(att.id));
            let data = await resp.arrayBuffer();
            if (isE2E) {
                data = await cryptoManager.decryptBuffer(chatId, data, fileNonce!);
            }
            const blob = new Blob([data]);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = att.filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) {
            console.error('Download failed:', e);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div
            className={`flex items-center gap-3 p-1 rounded-xl cursor-pointer transition ${own ? 'hover:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
            onClick={handleDownload}
        >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${own ? 'bg-white/20' : 'bg-accent/10'}`}>
                {downloading ? <Loader2 size={20} className="animate-spin" /> : <span>{getFileIcon(att.mime_type)}</span>}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{att.filename}</div>
                <div className="flex items-center gap-1.5 text-[11px] opacity-60">
                    <span>{formatFileSize(att.size_bytes)}</span>
                    {isE2E && <><Lock size={9} /> <span>E2E</span></>}
                </div>
            </div>
            <Download size={16} className="opacity-50 flex-shrink-0" />
        </div>
    );
}