// client/src/components/ui/Avatar.tsx

import React, { useState } from 'react';
import { getInitials, getAvatarColor } from '../../utils';
import { getFileUrl } from '../../api';

interface Props {
    name: string;
    size?: number;
    online?: boolean;
    avatarUrl?: string | null;
    userId?: string;
}

export function Avatar({ name, size = 40, online, avatarUrl, userId }: Props) {
    const [imgError, setImgError] = useState(false);

    // Если есть URL аватарки и картинка не сломана — показываем её
    const showImage = avatarUrl && !imgError;

    // Формируем полный URL
    const fullUrl = avatarUrl?.startsWith('/api/')
        ? `http://163.5.180.138:3000${avatarUrl}`
        : avatarUrl;

    return (
        <div
            className="avatar"
            style={{
                width: size,
                height: size,
                minWidth: size,
                backgroundColor: showImage ? 'transparent' : getAvatarColor(name),
                fontSize: size * 0.36,
                lineHeight: `${size}px`,
                overflow: 'hidden',
            }}
        >
            {showImage ? (
                <img
                    src={fullUrl!}
                    alt={name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%',
                    }}
                    onError={() => setImgError(true)}
                />
            ) : (
                getInitials(name)
            )}
            {online !== undefined && (
                <span
                    className={`status-dot ${online ? 'online' : ''}`}
                    style={{
                        width: size * 0.3,
                        height: size * 0.3,
                        borderWidth: size * 0.06
                    }}
                />
            )}
        </div>
    );
}