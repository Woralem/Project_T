import React, { useState, useEffect } from 'react';
import { getInitials, getAvatarColor } from '../../utils';
import { SERVER_URL } from '../../api';

interface Props { name: string; size?: number; online?: boolean; avatarUrl?: string | null }

export function Avatar({ name, size = 40, online, avatarUrl }: Props) {
    const [err, setErr] = useState(false);
    useEffect(() => setErr(false), [avatarUrl]);

    const fullUrl = avatarUrl && !err
        ? (avatarUrl.startsWith('http') ? avatarUrl : `${SERVER_URL}${avatarUrl.startsWith('/') ? '' : '/api/files/'}${avatarUrl}`)
        : null;

    return (
        <div className="avatar" style={{ width: size, height: size, minWidth: size, backgroundColor: fullUrl ? 'transparent' : getAvatarColor(name), fontSize: size * 0.36, lineHeight: `${size}px`, overflow: 'hidden' }}>
            {fullUrl ? (
                <img src={fullUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={() => setErr(true)} />
            ) : getInitials(name)}
            {online !== undefined && <span className={`status-dot ${online ? 'online' : ''}`} style={{ width: size * 0.3, height: size * 0.3, borderWidth: size * 0.06 }} />}
        </div>
    );
}