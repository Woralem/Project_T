import React, { useState, useEffect } from 'react';
import type { CallState } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';
import { SharedMediaPanel } from './SharedMediaPanel';

interface Props {
    callState: CallState;
    currentUserId: string;
    onHangup: () => void;
    onToggleMute: () => void;
    onSetPeerVolume: (v: number) => void;
    onSetMicGain: (v: number) => void;
    onDismiss: () => void;
    onToggleMediaPanel: () => void;
    onShareMedia: (fileId: string, fileName: string) => void;
    onRemoveMedia: (mediaId: string) => void;
    onControlMedia: (mediaId: string, action: 'play' | 'pause' | 'seek' | 'loop', time?: number) => void;
    onMediaVolumeChange: (mediaId: string, volume: number) => void;
    onMediaMuteToggle: (mediaId: string) => void;
    onMediaTitleUpdate: (mediaId: string, title: string) => void;
    onMediaTimeUpdate: (mediaId: string, currentTime: number, duration: number) => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function statusText(state: CallState): string {
    switch (state.status) {
        case 'calling': return 'Вызов...';
        case 'connecting': return 'Подключение...';
        case 'connected': return fmtDuration(state.duration);
        case 'ended':
            switch (state.endReason) {
                case 'rejected': return 'Отклонено';
                case 'timeout': return 'Нет ответа';
                case 'error': return 'Ошибка соединения';
                default: return 'Звонок завершён';
            }
        default: return '';
    }
}

export function CallOverlay({
    callState, currentUserId, onHangup, onToggleMute,
    onSetPeerVolume, onSetMicGain, onDismiss,
    onToggleMediaPanel, onShareMedia, onRemoveMedia, onControlMedia,
    onMediaVolumeChange, onMediaMuteToggle, onMediaTitleUpdate, onMediaTimeUpdate,
    showToast,
}: Props) {
    const {
        status, peerName, peerAvatarUrl, isMuted, peerMuted, isEncrypted,
        peerVolume, micGain, sharedMedia, showMediaPanel,
    } = callState;
    const [showVolume, setShowVolume] = useState(false);

    useEffect(() => {
        if (status === 'ended') {
            setShowVolume(false);
            const t = setTimeout(onDismiss, 3000);
            return () => clearTimeout(t);
        }
    }, [status, onDismiss]);

    if (status === 'idle' || status === 'ringing') return null;

    const isActive = status === 'calling' || status === 'connecting' || status === 'connected';
    const isEnded = status === 'ended';
    const isConnected = status === 'connected';
    const hasMedia = sharedMedia.length > 0;

    return (
        <div className={`call-overlay ${isEnded ? 'call-ended' : ''} ${showMediaPanel ? 'call-expanded' : ''}`}>
            <div className="call-overlay-inner">
                <div className="call-peer">
                    <Avatar name={peerName || '?'} size={48} avatarUrl={peerAvatarUrl} />
                    <div className="call-peer-info">
                        <div className="call-peer-name-row">
                            <span className="call-peer-name">{peerName || 'Неизвестный'}</span>
                            {peerMuted && <span className="call-peer-muted" title="Мьют">{Icon.micOff(14)}</span>}
                        </div>
                        <span className={`call-status-text ${status}`}>{statusText(callState)}</span>
                    </div>
                </div>

                {isEncrypted && isConnected && (
                    <span className="call-e2e-badge">{Icon.lock(12)} E2E</span>
                )}

                <div className="call-controls">
                    {isActive && (
                        <>
                            {isConnected && (
                                <>
                                    <button
                                        className={`call-ctrl-btn ${showMediaPanel ? 'active-soft' : ''} ${hasMedia ? 'has-media' : ''}`}
                                        onClick={onToggleMediaPanel}
                                        title="Музыка"
                                    >
                                        🎵
                                    </button>
                                    <button
                                        className={`call-ctrl-btn ${showVolume ? 'active-soft' : ''}`}
                                        onClick={() => setShowVolume(v => !v)}
                                        title="Громкость"
                                    >
                                        {Icon.sliders(18)}
                                    </button>
                                </>
                            )}
                            <button
                                className={`call-ctrl-btn ${isMuted ? 'active' : ''}`}
                                onClick={onToggleMute}
                                title={isMuted ? 'Вкл микрофон' : 'Выкл микрофон'}
                            >
                                {isMuted ? Icon.micOff(20) : Icon.mic(20)}
                            </button>
                            <button className="call-ctrl-btn hangup" onClick={onHangup} title="Завершить">
                                {Icon.phoneOff(20)}
                            </button>
                        </>
                    )}
                    {isEnded && (
                        <button className="call-ctrl-btn dismiss" onClick={onDismiss}>{Icon.x(18)}</button>
                    )}
                </div>
            </div>

            {showVolume && isConnected && (
                <div className="call-volume-panel">
                    <div className="call-volume-row">
                        <span className="call-volume-icon">{Icon.mic(15)}</span>
                        <input type="range" min={0} max={100} value={micGain}
                            className="call-volume-slider"
                            onChange={e => onSetMicGain(Number(e.target.value))} />
                        <span className="call-volume-value">{micGain}%</span>
                    </div>
                    <div className="call-volume-row">
                        <span className="call-volume-icon">{peerVolume === 0 ? Icon.volumeOff(15) : Icon.volumeHigh(15)}</span>
                        <input type="range" min={0} max={100} value={peerVolume}
                            className="call-volume-slider"
                            onChange={e => onSetPeerVolume(Number(e.target.value))} />
                        <span className="call-volume-value">{peerVolume}%</span>
                    </div>
                </div>
            )}

            {showMediaPanel && isConnected && (
                <SharedMediaPanel
                    media={sharedMedia}
                    currentUserId={currentUserId}
                    onShare={onShareMedia}
                    onRemove={onRemoveMedia}
                    onControl={onControlMedia}
                    onLocalVolumeChange={onMediaVolumeChange}
                    onLocalMuteToggle={onMediaMuteToggle}
                    onTitleUpdate={onMediaTitleUpdate}
                    onTimeUpdate={onMediaTimeUpdate}
                    showToast={showToast}
                />
            )}

            {status === 'calling' && <div className="call-pulse" />}
        </div>
    );
}