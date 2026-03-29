import React from 'react';
import type { CallState } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';

interface Props {
    callState: CallState;
    onAccept: () => void;
    onReject: () => void;
}

export function IncomingCallModal({ callState, onAccept, onReject }: Props) {
    if (callState.status !== 'ringing') return null;

    return (
        <div className="incoming-call-overlay">
            <div className="incoming-call-card">
                <div className="incoming-call-pulse-ring" />
                <Avatar
                    name={callState.peerName || '?'}
                    size={80}
                    avatarUrl={callState.peerAvatarUrl}
                />
                <h3 className="incoming-call-name">{callState.peerName}</h3>
                <p className="incoming-call-label">Входящий звонок...</p>
                {callState.isEncrypted && (
                    <span className="incoming-call-e2e">{Icon.lock(12)} Зашифрованный</span>
                )}
                <div className="incoming-call-actions">
                    <button className="incoming-call-btn reject" onClick={onReject} title="Отклонить">
                        {Icon.phoneOff(28)}
                    </button>
                    <button className="incoming-call-btn accept" onClick={onAccept} title="Принять">
                        {Icon.phone(28)}
                    </button>
                </div>
            </div>
        </div>
    );
}