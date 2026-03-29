import React, { useState, useEffect } from 'react';
import type { CallState } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';

interface Props {
    callState: CallState;
    onHangup: () => void;
    onToggleMute: () => void;
    onSetPeerVolume: (v: number) => void;
    onSetMicGain: (v: number) => void;
    onDismiss: () => void;
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
    callState, onHangup, onToggleMute,
    onSetPeerVolume, onSetMicGain, onDismiss,
}: Props) {
    const { status, peerName, peerAvatarUrl, isMuted, peerMuted, isEncrypted, peerVolume, micGain } = callState;
    const [showControls, setShowControls] = useState(false);

    // Автоскрытие "ended"
    useEffect(() => {
        if (status === 'ended') {
            setShowControls(false);
            const t = setTimeout(onDismiss, 3000);
            return () => clearTimeout(t);
        }
    }, [status, onDismiss]);

    if (status === 'idle' || status === 'ringing') return null;

    const isActive = status === 'calling' || status === 'connecting' || status === 'connected';
    const isEnded = status === 'ended';
    const isConnected = status === 'connected';

    return (
        <div className={`call-overlay ${isEnded ? 'call-ended' : ''}`}>
            <div className="call-overlay-inner">
                <div className="call-peer">
                    <Avatar name={peerName || '?'} size={48} avatarUrl={peerAvatarUrl} />
                    <div className="call-peer-info">
                        <div className="call-peer-name-row">
                            <span className="call-peer-name">{peerName || 'Неизвестный'}</span>
                            {peerMuted && (
                                <span className="call-peer-muted" title="Микрофон выключен">
                                    {Icon.micOff(14)}
                                </span>
                            )}
                        </div>
                        <span className={`call-status-text ${status}`}>
                            {statusText(callState)}
                        </span>
                    </div>
                </div>

                {isEncrypted && isConnected && (
                    <span className="call-e2e-badge">{Icon.lock(12)} E2E</span>
                )}

                <div className="call-controls">
                    {isActive && (
                        <>
                            {isConnected && (
                                <button
                                    className={`call-ctrl-btn ${showControls ? 'active-soft' : ''}`}
                                    onClick={() => setShowControls(v => !v)}
                                    title="Настройки звука"
                                >
                                    {Icon.sliders(18)}
                                </button>
                            )}
                            <button
                                className={`call-ctrl-btn ${isMuted ? 'active' : ''}`}
                                onClick={onToggleMute}
                                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                            >
                                {isMuted ? Icon.micOff(20) : Icon.mic(20)}
                            </button>
                            <button className="call-ctrl-btn hangup" onClick={onHangup} title="Завершить">
                                {Icon.phoneOff(20)}
                            </button>
                        </>
                    )}
                    {isEnded && (
                        <button className="call-ctrl-btn dismiss" onClick={onDismiss}>
                            {Icon.x(18)}
                        </button>
                    )}
                </div>
            </div>

            {/* Панель громкости */}
            {showControls && isConnected && (
                <div className="call-volume-panel">
                    <div className="call-volume-row">
                        <span className="call-volume-icon" title="Микрофон">
                            {Icon.mic(15)}
                        </span>
                        <input
                            type="range" min={0} max={100} value={micGain}
                            className="call-volume-slider"
                            onChange={e => onSetMicGain(Number(e.target.value))}
                        />
                        <span className="call-volume-value">{micGain}%</span>
                    </div>
                    <div className="call-volume-row">
                        <span className="call-volume-icon" title="Динамик">
                            {peerVolume === 0 ? Icon.volumeOff(15) : Icon.volumeHigh(15)}
                        </span>
                        <input
                            type="range" min={0} max={100} value={peerVolume}
                            className="call-volume-slider"
                            onChange={e => onSetPeerVolume(Number(e.target.value))}
                        />
                        <span className="call-volume-value">{peerVolume}%</span>
                    </div>
                </div>
            )}

            {status === 'calling' && <div className="call-pulse" />}
        </div>
    );
}