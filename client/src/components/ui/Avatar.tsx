import React, { useState, useEffect } from 'react';
import { getInitials, getAvatarColor } from '../../utils';

interface Props {
    name: string;
    size?: number;
    online?: boolean;
    avatarUrl?: string | null;
}

export function Avatar({ name, size = 40, online, avatarUrl }: Props) {
    const [imgError, setImgError] = useState(false);

    // Сбрасываем ошибку при смене URL
    useEffect(() => {
        setImgError(false);
    }, [avatarUrl]);

    const showImage = !!avatarUrl && !imgError;

    // Формируем полный URL
    const getFullUrl = (url: string): string => {
        if (url.startsWith('http')) return url;
        if (url.startsWith('/api/')) {
            return `http://163.5.180.138:3000${url}`;
        }
        return `http://163.5.180.138:3000/api/files/${url}`;
    };

    const fullUrl = avatarUrl ? getFullUrl(avatarUrl) : null;

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
            {showImage && fullUrl ? (
                <img
                    src={fullUrl}
                    alt={name}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%',
                    }}
                    onError={() => {
                        console.warn('Avatar load failed:', fullUrl);
                        setImgError(true);
                    }}
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
                        borderWidth: size * 0.06,
                    }}
                />
            )}
        </div>
    );
}