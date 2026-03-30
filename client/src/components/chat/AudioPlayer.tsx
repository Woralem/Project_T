import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cryptoManager } from '../../crypto';
import { Icon } from '../../icons';
import type { ActiveVoice } from '../../types';

interface Props {
    src: string;
    encryptedNonce?: string;
    chatId?: string;
    attachmentId?: string;
    senderName?: string;
    messageId?: string;
    onActivate?: (v: ActiveVoice) => void;
    onDeactivate?: () => void;
}

const SPEEDS = [1, 1.5, 2, 0.5];

export function AudioPlayer({ src, encryptedNonce, chatId, attachmentId, senderName, messageId, onActivate, onDeactivate }: Props) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [decryptError, setDecryptError] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(0);
    const [volume, setVolume] = useState(100);
    const [showVolume, setShowVolume] = useState(false);
    const [dragging, setDragging] = useState(false);
    const urlRef = useRef<string | null>(null);
    const isEncrypted = !!encryptedNonce && !!chatId;

    useEffect(() => {
        if (!isEncrypted) return;
        let cancelled = false;
        setDecrypting(true); setDecryptError(false);
        (async () => {
            try {
                const resp = await fetch(src); if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const encData = await resp.arrayBuffer(); if (cancelled) return;
                const decData = await cryptoManager.decryptBuffer(chatId!, encData, encryptedNonce!, attachmentId); if (cancelled) return;
                const url = URL.createObjectURL(new Blob([decData], { type: 'audio/webm' }));
                urlRef.current = url; setDecryptedUrl(url);
            } catch (e) { console.error('[E2E] Voice decrypt failed:', e); if (!cancelled) setDecryptError(true); }
            finally { if (!cancelled) setDecrypting(false); }
        })();
        return () => { cancelled = true; if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; } };
    }, [src, encryptedNonce, chatId, isEncrypted, attachmentId]);

    const audioSrc = isEncrypted ? decryptedUrl : src;

    useEffect(() => {
        const a = audioRef.current; if (!a || !audioSrc) return;
        const onL = () => setDuration(a.duration || 0);
        const onT = () => { if (!dragging) setCurrentTime(a.currentTime); };
        const onE = () => { setPlaying(false); setCurrentTime(0); onDeactivate?.(); };
        const onPause = () => setPlaying(false);
        const onPlay = () => setPlaying(true);
        a.addEventListener('loadedmetadata', onL);
        a.addEventListener('timeupdate', onT);
        a.addEventListener('ended', onE);
        a.addEventListener('pause', onPause);
        a.addEventListener('play', onPlay);
        return () => {
            a.removeEventListener('loadedmetadata', onL);
            a.removeEventListener('timeupdate', onT);
            a.removeEventListener('ended', onE);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('play', onPlay);
        };
    }, [audioSrc, dragging, onDeactivate]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume / 100;
    }, [volume]);

    const toggle = useCallback(() => {
        const a = audioRef.current; if (!a) return;
        if (playing) { a.pause(); onDeactivate?.(); }
        else { a.play().catch(() => { }); if (onActivate && messageId) onActivate({ audio: a, messageId, senderName: senderName || '' }); }
    }, [playing, onActivate, onDeactivate, messageId, senderName]);

    const cycleSpeed = useCallback(() => {
        const next = (speedIdx + 1) % SPEEDS.length;
        setSpeedIdx(next);
        if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
    }, [speedIdx]);

    // Draggable seek
    const seekFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
        const a = audioRef.current; const t = trackRef.current;
        if (!a || !t || !duration) return;
        const r = t.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        a.currentTime = pct * duration;
        setCurrentTime(pct * duration);
    }, [duration]);

    const onTrackMouseDown = useCallback((e: React.MouseEvent) => {
        setDragging(true); seekFromEvent(e);
        const onMove = (ev: MouseEvent) => seekFromEvent(ev);
        const onUp = () => { setDragging(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [seekFromEvent]);

    const fmt = (s: number) => !s || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    if (decrypting) return (<div className="audio-player"><div className="audio-play-btn" style={{ opacity: .5 }}>{Icon.lock(16)}</div><span style={{ fontSize: 12, opacity: .6, flex: 1 }}>Расшифровка…</span></div>);
    if (decryptError) return (<div className="audio-player"><div className="audio-play-btn" style={{ opacity: .5, background: 'var(--red)' }}>{Icon.lock(16)}</div><span style={{ fontSize: 12, opacity: .6, flex: 1 }}>🔒 Не удалось расшифровать</span></div>);
    if (isEncrypted && !audioSrc) return (<div className="audio-player"><span style={{ fontSize: 12, opacity: .5 }}>Загрузка…</span></div>);

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const speed = SPEEDS[speedIdx];

    return (
        <div className="audio-player-wrap">
            {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}
            <div className="audio-player">
                <button className="audio-play-btn" onClick={toggle} disabled={!audioSrc}>
                    {playing
                        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
                </button>
                <div className="audio-track" ref={trackRef} onMouseDown={onTrackMouseDown}>
                    <div className="audio-track-fill" style={{ width: `${pct}%` }} />
                    <div className="audio-track-thumb" style={{ left: `${pct}%` }} />
                </div>
                <button className="audio-speed-btn" onClick={cycleSpeed} title="Скорость">{speed}×</button>
                <button className="audio-vol-btn" onClick={() => setShowVolume(v => !v)} title="Громкость">
                    {volume === 0 ? Icon.volumeOff(15) : Icon.volumeHigh(15)}
                </button>
                <span className="audio-time">{playing ? fmt(currentTime) : fmt(duration)}</span>
            </div>
            {showVolume && (
                <div className="audio-volume-row">
                    <span className="audio-volume-icon">{volume === 0 ? Icon.volumeOff(14) : Icon.volumeHigh(14)}</span>
                    <input type="range" min={0} max={100} value={volume}
                        className="audio-volume-slider"
                        onChange={e => setVolume(Number(e.target.value))} />
                    <span className="audio-volume-value">{volume}%</span>
                </div>
            )}
        </div>
    );
}