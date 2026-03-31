import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Loader2, Lock, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { cryptoManager } from '../../crypto';
import { getFileUrl } from '../../api';

interface Props {
    src: string;
    mediaType: 'image' | 'video';
    filename?: string;
    chatId?: string;
    fileNonce?: string;
    onClose: () => void;
}

export function MediaViewer({ src, mediaType, filename, chatId, fileNonce, onClose }: Props) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const urlRef = useRef<string | null>(null);

    const isEncrypted = !!fileNonce && !!chatId;

    // Расшифровка если E2E
    useEffect(() => {
        if (!isEncrypted) { setBlobUrl(src); return; }

        let cancelled = false;
        setLoading(true);
        setError(false);

        (async () => {
            try {
                const resp = await fetch(src);
                if (!resp.ok) throw new Error('fetch failed');
                const encData = await resp.arrayBuffer();
                if (cancelled) return;
                const decData = await cryptoManager.decryptBuffer(chatId!, encData, fileNonce!);
                if (cancelled) return;
                const url = URL.createObjectURL(new Blob([decData]));
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
    }, [src, isEncrypted, chatId, fileNonce]);

    // Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 5));
            if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25));
            if (e.key === '0') { setZoom(1); setRotation(0); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleDownload = useCallback(async () => {
        try {
            let data: ArrayBuffer;
            if (isEncrypted) {
                if (blobUrl && blobUrl.startsWith('blob:')) {
                    const resp = await fetch(blobUrl);
                    data = await resp.arrayBuffer();
                } else {
                    const resp = await fetch(src);
                    const enc = await resp.arrayBuffer();
                    data = await cryptoManager.decryptBuffer(chatId!, enc, fileNonce!);
                }
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
            setTimeout(() => URL.revokeObjectURL(url), 3000);
        } catch (e) { console.error('Download failed:', e); }
    }, [src, isEncrypted, blobUrl, chatId, fileNonce, filename, mediaType]);

    const displayUrl = isEncrypted ? blobUrl : src;

    return (
        <div className="fixed inset-0 z-[3000] bg-black/90 backdrop-blur-sm flex flex-col" onClick={onClose}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 min-w-0">
                    {isEncrypted && <Lock size={14} className="text-green-400 flex-shrink-0" />}
                    <span className="text-white/70 text-[13px] truncate">{filename || 'Медиа'}</span>
                </div>
                <div className="flex items-center gap-1">
                    {mediaType === 'image' && (
                        <>
                            <ToolBtn onClick={() => setZoom(z => Math.min(z + 0.25, 5))} title="Увеличить"><ZoomIn size={18} /></ToolBtn>
                            <ToolBtn onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Уменьшить"><ZoomOut size={18} /></ToolBtn>
                            <ToolBtn onClick={() => setRotation(r => r + 90)} title="Повернуть"><RotateCw size={18} /></ToolBtn>
                            <span className="text-white/40 text-[11px] mx-1">{Math.round(zoom * 100)}%</span>
                        </>
                    )}
                    <ToolBtn onClick={handleDownload} title="Скачать"><Download size={18} /></ToolBtn>
                    <ToolBtn onClick={onClose} title="Закрыть"><X size={18} /></ToolBtn>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden p-4" onClick={e => e.stopPropagation()}>
                {loading && (
                    <div className="flex flex-col items-center gap-3 text-white/60">
                        <Loader2 size={32} className="animate-spin" />
                        <span className="text-[13px]">Расшифровка...</span>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center gap-2 text-red-400">
                        <Lock size={32} />
                        <span className="text-[13px]">Не удалось расшифровать</span>
                    </div>
                )}

                {!loading && !error && displayUrl && mediaType === 'image' && (
                    <img
                        src={displayUrl}
                        alt={filename || ''}
                        className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
                        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                        draggable={false}
                        onDoubleClick={() => setZoom(z => z === 1 ? 2 : 1)}
                    />
                )}

                {!loading && !error && displayUrl && mediaType === 'video' && (
                    <video
                        src={displayUrl}
                        controls autoPlay playsInline
                        className="max-w-full max-h-full"
                    />
                )}
            </div>

            {/* Подсказки */}
            <div className="flex justify-center gap-4 pb-3 text-white/20 text-[10px]">
                <span>ESC — закрыть</span>
                {mediaType === 'image' && <><span>+/- — зум</span><span>0 — сброс</span><span>двойной клик — x2</span></>}
            </div>
        </div>
    );
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
    return (
        <button
            className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition active:scale-90"
            onClick={e => { e.stopPropagation(); onClick(); }}
            title={title}
        >
            {children}
        </button>
    );
}