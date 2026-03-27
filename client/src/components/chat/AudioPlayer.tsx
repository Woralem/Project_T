import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../../icons';

interface Props {
    src: string;
}

export function AudioPlayer({ src }: Props) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onLoaded = () => setDuration(audio.duration || 0);
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onEnded = () => { setPlaying(false); setCurrentTime(0); };

        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
        };
    }, [src]);

    const toggle = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
        } else {
            audio.play().catch(() => { });
        }
        setPlaying(!playing);
    }, [playing]);

    const seek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pct * duration;
    };

    const fmt = (s: number) => {
        if (!s || !isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
    };

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="audio-player">
            <audio ref={audioRef} src={src} preload="metadata" />

            <button className="audio-play-btn" onClick={toggle}>
                {playing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5,3 19,12 5,21" />
                    </svg>
                )}
            </button>

            <div className="audio-track" onClick={seek}>
                <div className="audio-track-fill" style={{ width: `${pct}%` }} />
                <div className="audio-track-thumb" style={{ left: `${pct}%` }} />
            </div>

            <span className="audio-time">
                {playing ? fmt(currentTime) : fmt(duration)}
            </span>
        </div>
    );
}