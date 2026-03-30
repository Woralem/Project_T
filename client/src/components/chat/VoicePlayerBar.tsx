import React, { useState, useEffect, useCallback } from 'react';
import type { ActiveVoice } from '../../types';
import { Icon } from '../../icons';

interface Props {
    voice: ActiveVoice;
    onClose: () => void;
}

const SPEEDS = [1, 1.5, 2, 0.5];

export function VoicePlayerBar({ voice, onClose }: Props) {
    const { audio, senderName } = voice;
    const [playing, setPlaying] = useState(!audio.paused);
    const [currentTime, setCurrent] = useState(audio.currentTime);
    const [duration, setDuration] = useState(audio.duration || 0);
    const [speedIdx, setSpeedIdx] = useState(0);
    const [volume, setVolume] = useState(Math.round(audio.volume * 100));
    const [showVolume, setShowVolume] = useState(false);

    useEffect(() => {
        const onP = () => setPlaying(true);
        const onPa = () => setPlaying(false);
        const onT = () => setCurrent(audio.currentTime);
        const onL = () => setDuration(audio.duration || 0);
        const onE = () => { setPlaying(false); onClose(); };
        audio.addEventListener('play', onP);
        audio.addEventListener('pause', onPa);
        audio.addEventListener('timeupdate', onT);
        audio.addEventListener('loadedmetadata', onL);
        audio.addEventListener('ended', onE);
        return () => {
            audio.removeEventListener('play', onP);
            audio.removeEventListener('pause', onPa);
            audio.removeEventListener('timeupdate', onT);
            audio.removeEventListener('loadedmetadata', onL);
            audio.removeEventListener('ended', onE);
        };
    }, [audio, onClose]);

    const toggle = useCallback(() => { if (playing) audio.pause(); else audio.play().catch(() => { }); }, [audio, playing]);

    const stop = useCallback(() => { audio.pause(); audio.currentTime = 0; onClose(); }, [audio, onClose]);

    const cycleSpeed = useCallback(() => {
        const next = (speedIdx + 1) % SPEEDS.length;
        setSpeedIdx(next);
        audio.playbackRate = SPEEDS[next];
    }, [speedIdx, audio]);

    const handleVolume = useCallback((val: number) => {
        setVolume(val);
        audio.volume = val / 100;
    }, [audio]);

    const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!duration) return;
        const r = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        audio.currentTime = pct * duration;
    }, [audio, duration]);

    const fmt = (s: number) => !s || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="voice-player-bar-wrap">
            <div className="voice-player-bar">
                <button className="voice-bar-play" onClick={toggle}>
                    {playing
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
                </button>
                <div className="voice-bar-info">
                    <span className="voice-bar-name">🎤 {senderName}</span>
                    <div className="voice-bar-progress" onClick={handleSeek}>
                        <div className="voice-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                </div>
                <span className="voice-bar-time">{fmt(currentTime)} / {fmt(duration)}</span>
                <button className="voice-bar-speed" onClick={cycleSpeed}>{SPEEDS[speedIdx]}×</button>
                <button className="voice-bar-vol-btn" onClick={() => setShowVolume(v => !v)} title="Громкость">
                    {volume === 0 ? Icon.volumeOff(16) : Icon.volumeHigh(16)}
                </button>
                <button className="voice-bar-close" onClick={stop}>{Icon.x(16)}</button>
            </div>
            {showVolume && (
                <div className="voice-bar-volume-row">
                    <span className="voice-bar-volume-icon">{volume === 0 ? Icon.volumeOff(14) : Icon.volumeHigh(14)}</span>
                    <input type="range" min={0} max={100} value={volume}
                        className="voice-bar-volume-slider"
                        onChange={e => handleVolume(Number(e.target.value))} />
                    <span className="voice-bar-volume-value">{volume}%</span>
                </div>
            )}
        </div>
    );
}