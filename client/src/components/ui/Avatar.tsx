import React from 'react';
import { getInitials, getAvatarColor } from '../../utils';

interface Props {
    name: string;
    size?: number;
    online?: boolean;
}

export function Avatar({ name, size = 40, online }: Props) {
    return (
        <div
            className="avatar"
            style={{
                width: size,
                height: size,
                minWidth: size,
                backgroundColor: getAvatarColor(name),
                fontSize: size * 0.36,
                lineHeight: `${size}px`,
            }}
        >
            {getInitials(name)}
            {online !== undefined && (
                <span
                    className={`status-dot ${online ? 'online' : ''}`}
                    style={{ width: size * 0.3, height: size * 0.3, borderWidth: size * 0.06 }}
                />
            )}
        </div>
    );
}