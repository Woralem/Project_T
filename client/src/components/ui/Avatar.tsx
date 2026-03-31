import React, { useState, useEffect } from 'react';
import { getInitials, getAvatarColor } from '../../utils';
import { SERVER_URL } from '../../api';

interface Props {
    name: string;
    size?: number;
    online?: boolean;
    avatarUrl?: string | null;
}

export function Avatar({ name, size = 40, online, avatarUrl }: Props) {
    const [err, setErr] = useState(false);
    useEffect(() => setErr(false), [avatarUrl]);

    const fullUrl = avatarUrl && !err
        ? (avatarUrl.startsWith('http') ? avatarUrl : `${SERVER_URL}${avatarUrl.startsWith('/') ? '' : '/api/files/'}${avatarUrl}`)
        : null;

    const dotSize = Math.max(10, size * 0.25);
    const borderSize = Math.max(2, size * 0.05);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            {/* Avatar circle — ALWAYS round */}
            <div
                className="w-full h-full rounded-full flex items-center justify-center text-white font-bold select-none overflow-hidden"
                style={{
                    backgroundColor: fullUrl ? 'transparent' : getAvatarColor(name),
                    fontSize: size * 0.36,
                    lineHeight: `${size}px`,
                }}
            >
                {fullUrl ? (
                    <img
                        src={fullUrl}
                        alt={name}
                        className="w-full h-full object-cover rounded-full"
                        onError={() => setErr(true)}
                        draggable={false}
                    />
                ) : (
                    getInitials(name)
                )}
            </div>

            {/* Online indicator dot */}
            {online !== undefined && (
                <span
                    className={`absolute bottom-0 right-0 rounded-full border-white dark:border-[#15151c] ${online ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                    style={{
                        width: dotSize,
                        height: dotSize,
                        borderWidth: borderSize,
                        borderStyle: 'solid',
                    }}
                />
            )}
        </div>
    );
}