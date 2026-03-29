import React, { useEffect } from 'react';
import type { CallState } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';

interface Props {
    callState: CallState;
    onHangup: () => void;
    onToggleMute: () => void;
    onDismiss: () => void;
}

function fmtDuration(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
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

export function CallOverlay({ callState, onHangup, onToggleMute, onDismiss }: Props) {
    const { status, peerName, peerAvatarUrl, isMuted, isEncrypted } = callState;

    // Автоскрытие "ended" через 3 секунды
    useEffect(() => {
        if (status === 'ended') {
            const t = setTimeout(onDismiss, 3000);
            return () => clearTimeout(t);
        }
    }, [status, onDismiss]);

    if (status === 'idle' || status === 'ringing') return null;

    const isActive = status === 'calling' || status === 'connecting' || status === 'connected';
    const isEnded = status === 'ended';

    return (
        <div className={`call-overlay ${isEnded ? 'call-ended' : ''}`}>
            <div className="call-overlay-inner">
                <div className="call-peer">
                    <Avatar
                        name={peerName || '?'}
                        size={56}
                        avatarUrl={peerAvatarUrl}
                    />
                    <div className="call-peer-info">
                        <span className="call-peer-name">{peerName || 'Неизвестный'}</span>
                        <span className={`call-status-text ${status}`}>
                            {statusText(callState)}
                        </span>
                    </div>
                </div>

                {isEncrypted && status === 'connected' && (
                    <span className="call-e2e-badge">{Icon.lock(12)} E2E</span>
                )}

                <div className="call-controls">
                    {isActive && (
                        <>
                            <button
                                className={`call-ctrl-btn ${isMuted ? 'active' : ''}`}
                                onClick={onToggleMute}
                                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                            >
                                {isMuted ? Icon.micOff(20) : Icon.mic(20)}
                            </button>
                            <button
                                className="call-ctrl-btn hangup"
                                onClick={onHangup}
                                title="Завершить"
                            >
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

            {status === 'calling' && <div className="call-pulse" />}
        </div>
    );
}