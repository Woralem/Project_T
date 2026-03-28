import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cryptoManager } from '../../crypto';
import { Icon } from '../../icons';

interface Props {
    src: string;
    encryptedNonce?: string;
    chatId?: string;
    attachmentId?: string;
}

export function AudioPlayer({ src, encryptedNonce, chatId, attachmentId }: Props) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [decryptError, setDecryptError] = useState(false);
    const urlRef = useRef<string | null>(null);

    const isEncrypted = !!encryptedNonce && !!chatId;

    useEffect(() => {
        if (!isEncrypted) return;
        let cancelled = false;
        setDecrypting(true);
        setDecryptError(false);

        (async () => {
            try {
                const resp = await fetch(src);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const encData = await resp.arrayBuffer();
                if (cancelled) return;

                const decData = await cryptoManager.decryptBuffer(chatId!, encData, encryptedNonce!, attachmentId);
                if (cancelled) return;

                const blob = new Blob([decData], { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                urlRef.current = url;
                setDecryptedUrl(url);
            } catch (e) {
                console.error('[E2E] Voice decrypt failed:', e);
                if (!cancelled) setDecryptError(true);
            } finally {
                if (!cancelled) setDecrypting(false);
            }
        })();

        return () => {
            cancelled = true;
            if (urlRef.current) {
                URL.revokeObjectURL(urlRef.current);
                urlRef.current = null;
            }
        };
    }, [src, encryptedNonce, chatId, isEncrypted, attachmentId]);

    const audioSrc = isEncrypted ? decryptedUrl : src;

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioSrc) return;
        const onL = () => setDuration(audio.duration || 0);
        const onT = () => setCurrentTime(audio.currentTime);
        const onE = () => { setPlaying(false); setCurrentTime(0); };
        audio.addEventListener('loadedmetadata', onL);
        audio.addEventListener('timeupdate', onT);
        audio.addEventListener('ended', onE);
        return () => {
            audio.removeEventListener('loadedmetadata', onL);
            audio.removeEventListener('timeupdate', onT);
            audio.removeEventListener('ended', onE);
        };
    }, [audioSrc]);

    const toggle = useCallback(() => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) a.pause(); else a.play().catch(() => { });
        setPlaying(!playing);
    }, [playing]);

    const seek = (e: React.MouseEvent<HTMLDivElement>) => {
        const a = audioRef.current;
        if (!a || !duration) return;
        const r = e.currentTarget.getBoundingClientRect();
        a.currentTime = ((e.clientX - r.left) / r.width) * duration;
    };

    const fmt = (s: number) => !s || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    if (decrypting) return (
        <div className="audio-player">
            <div className="audio-play-btn" style={{ opacity: .5 }}>{Icon.lock(16)}</div>
            <span style={{ fontSize: 12, opacity: .6, flex: 1 }}>Расшифровка…</span>
        </div>
    );

    if (decryptError) return (
        <div className="audio-player">
            <div className="audio-play-btn" style={{ opacity: .5, background: 'var(--red)' }}>{Icon.lock(16)}</div>
            <span style={{ fontSize: 12, opacity: .6, flex: 1 }}>🔒 Не удалось расшифровать</span>
        </div>
    );

    if (isEncrypted && !audioSrc) return (
        <div className="audio-player">
            <span style={{ fontSize: 12, opacity: .5 }}>Загрузка…</span>
        </div>
    );

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="audio-player">
            {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
            <button className="audio-play-btn" onClick={toggle} disabled={!audioSrc}>
                {playing
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
            </button>
            <div className="audio-track" onClick={seek}>
                <div className="audio-track-fill" style={{ width: `${pct}%` }} />
                <div className="audio-track-thumb" style={{ left: `${pct}%` }} />
            </div>
            <span className="audio-time">{playing ? fmt(currentTime) : fmt(duration)}</span>
        </div>
    );
}