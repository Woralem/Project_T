import React from 'react';
import { Icon } from '../../icons';

export function MsgStatus({ status }: { status?: string }) {
    if (!status) return null;
    return (
        <span className={`msg-status ${status === 'read' ? 'read' : ''}`}>
            {status === 'sent' ? Icon.check(12) : Icon.checkDouble(12)}
        </span>
    );
}