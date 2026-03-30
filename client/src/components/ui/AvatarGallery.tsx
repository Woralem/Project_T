import React, { useState, useEffect, useCallback } from 'react';
import { formatDateFull } from '../../utils';
import { Icon } from '../../icons';

interface Props {
    urls: string[];
    dates?: string[];
    startIndex?: number;
    onClose: () => void;
}

export function AvatarGallery({ urls, dates, startIndex = 0, onClose }: Props) {
    const [index, setIndex] = useState(startIndex);
    const [imgError, setImgError] = useState(false);

    const total = urls.length;
    const hasPrev = index > 0;
    const hasNext = index < total - 1;

    useEffect(() => { setImgError(false); }, [index]);

    const goNext = useCallback(() => {
        if (hasNext) setIndex(i => i + 1);
    }, [hasNext]);

    const goPrev = useCallback(() => {
        if (hasPrev) setIndex(i => i - 1);
    }, [hasPrev]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, goNext, goPrev]);

    return (
        <div className="avatar-gallery-overlay" onMouseDown={onClose}>
            <div className="avatar-gallery-inner" onMouseDown={e => e.stopPropagation()}>
                {/* Закрыть */}
                <button className="avatar-gallery-close" onClick={onClose}>
                    {Icon.x(24)}
                </button>

                {/* Счётчик */}
                {total > 1 && (
                    <div className="avatar-gallery-counter">
                        {index + 1} / {total}
                    </div>
                )}

                {/* Стрелки */}
                {hasPrev && (
                    <button className="avatar-gallery-nav prev" onClick={goPrev}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                )}
                {hasNext && (
                    <button className="avatar-gallery-nav next" onClick={goNext}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 6 15 12 9 18" />
                        </svg>
                    </button>
                )}

                {/* Изображение */}
                <div className="avatar-gallery-image-wrap">
                    {imgError ? (
                        <div className="avatar-gallery-error">Не удалось загрузить</div>
                    ) : (
                        <img
                            src={urls[index]}
                            alt=""
                            className="avatar-gallery-image"
                            onError={() => setImgError(true)}
                        />
                    )}
                </div>

                {/* Дата */}
                {dates && dates[index] && (
                    <div className="avatar-gallery-date">
                        {formatDateFull(dates[index])}
                    </div>
                )}
            </div>
        </div>
    );
}