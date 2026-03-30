import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cryptoManager } from '../../crypto';
import { Icon } from '../../icons';

interface Props {
    src: string;
    mediaType: 'image' | 'video';
    filename?: string;
    chatId?: string;
    nonce?: string;
    attachmentId?: string;
    onClose: () => void;
}

export function MediaViewer({ src, mediaType, filename, chatId, nonce, attachmentId, onClose }: Props) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const urlRef = useRef<string | null>(null);

    const isEncrypted = !!nonce && !!chatId;

    useEffect(() => {
        if (!isEncrypted) return;
        let cancelled = false;
        setLoading(true);
        setError(false);

        (async () => {
            try {
                const resp = await fetch(src);
                if (!resp.ok) throw new Error('fetch');
                const encData = await resp.arrayBuffer();
                if (cancelled) return;
                const decData = await cryptoManager.decryptBuffer(chatId!, encData, nonce!, attachmentId);
                if (cancelled) return;
                const blob = new Blob([decData]);
                const url = URL.createObjectURL(blob);
                urlRef.current = url;
                setBlobUrl(url);
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
        };
    }, [src, isEncrypted, chatId, nonce, attachmentId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const displayUrl = isEncrypted ? blobUrl : src;

    const handleDownload = useCallback(async () => {
        try {
            let data: ArrayBuffer;
            if (isEncrypted && blobUrl) {
                const resp = await fetch(blobUrl);
                data = await resp.arrayBuffer();
            } else if (isEncrypted) {
                const resp = await fetch(src);
                const enc = await resp.arrayBuffer();
                data = await cryptoManager.decryptBuffer(chatId!, enc, nonce!, attachmentId);
            } else {
                const resp = await fetch(src);
                data = await resp.arrayBuffer();
            }
            const blob = new Blob([data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || (mediaType === 'video' ? 'video.mp4' : 'image.jpg');
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            console.error('Download failed:', e);
        }
    }, [src, isEncrypted, blobUrl, chatId, nonce, attachmentId, filename, mediaType]);

    return (
        <div className="media-viewer-overlay" onMouseDown={onClose}>
            <div className="media-viewer-inner" onMouseDown={e => e.stopPropagation()}>
                <button className="media-viewer-close" onClick={onClose}>{Icon.x(24)}</button>

                <div className="media-viewer-actions">
                    <button className="media-viewer-action-btn" onClick={handleDownload} title="Скачать">
                        {Icon.download(20)}
                    </button>
                </div>

                {loading && (
                    <div className="media-viewer-loading">
                        {Icon.lock(24)}
                        <span>Расшифровка…</span>
                    </div>
                )}

                {error && (
                    <div className="media-viewer-error">
                        🔒 Не удалось расшифровать
                    </div>
                )}

                {!loading && !error && displayUrl && (
                    <div className="media-viewer-content">
                        {mediaType === 'image' ? (
                            <img src={displayUrl} alt={filename || ''} className="media-viewer-img" />
                        ) : (
                            <video
                                src={displayUrl}
                                className="media-viewer-video"
                                controls
                                autoPlay
                                playsInline
                            />
                        )}
                    </div>
                )}

                {filename && (
                    <div className="media-viewer-filename">{filename}</div>
                )}
            </div>
        </div>
    );
}