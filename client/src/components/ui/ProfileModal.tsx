import React, { useState, useEffect, useCallback } from 'react';
import type { UserProfileDto } from '../../types';
import * as api from '../../api';
import { SERVER_URL } from '../../api';
import { formatDate } from '../../utils';
import { Avatar } from './Avatar';
import { AvatarGallery } from './AvatarGallery';
import { Icon } from '../../icons';

interface Props {
    userId: string;
    currentUserId: string;
    onClose: () => void;
    onMessage: (userId: string) => void;
    onCall: (userId: string) => void;
    onEdit: () => void;
}

function fullUrl(url: string): string {
    if (url.startsWith('http')) return url;
    return `${SERVER_URL}${url}`;
}

export function ProfileModal({ userId, currentUserId, onClose, onMessage, onCall, onEdit }: Props) {
    const [profile, setProfile] = useState<UserProfileDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);

    const isMe = userId === currentUserId;

    useEffect(() => {
        setLoading(true);
        setError('');
        api.getUserProfile(userId)
            .then(p => setProfile(p))
            .catch(e => setError(e.message || 'Ошибка загрузки'))
            .finally(() => setLoading(false));
    }, [userId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !galleryOpen) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, galleryOpen]);

    const openGallery = useCallback((index: number) => {
        setGalleryIndex(index);
        setGalleryOpen(true);
    }, []);

    const avatars = profile?.avatars || [];
    const galleryUrls = avatars.map(a => fullUrl(a.url));
    const galleryDates = avatars.map(a => a.set_at);

    return (
        <>
            <div className="modal-overlay" onMouseDown={onClose}>
                <div className="profile-modal" onMouseDown={e => e.stopPropagation()}>
                    <button className="profile-modal-close" onClick={onClose}>
                        {Icon.x(20)}
                    </button>

                    {loading && (
                        <div className="profile-modal-loading">Загрузка…</div>
                    )}

                    {error && (
                        <div className="profile-modal-error">{error}</div>
                    )}

                    {profile && !loading && (
                        <>
                            {/* Аватарка */}
                            <div className="profile-avatar-section">
                                <div
                                    className={`profile-avatar-wrap ${avatars.length > 0 ? 'clickable' : ''}`}
                                    onClick={() => avatars.length > 0 && openGallery(0)}
                                >
                                    <Avatar
                                        name={profile.display_name}
                                        size={120}
                                        online={profile.online}
                                        avatarUrl={profile.avatar_url}
                                    />
                                    {avatars.length > 1 && (
                                        <span className="profile-avatar-count">
                                            {avatars.length} фото
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Имя и юзернейм */}
                            <div className="profile-name-section">
                                <h2 className="profile-display-name">{profile.display_name}</h2>
                                <span className="profile-username">@{profile.username}</span>
                                <span className={`profile-online-status ${profile.online ? 'online' : ''}`}>
                                    {profile.online ? 'в сети' : 'был(а) недавно'}
                                </span>
                            </div>

                            {/* Био */}
                            {profile.bio && (
                                <div className="profile-info-section">
                                    <div className="profile-info-label">О себе</div>
                                    <div className="profile-info-value">{profile.bio}</div>
                                </div>
                            )}

                            {/* Дата регистрации */}
                            <div className="profile-info-section">
                                <div className="profile-info-label">В мессенджере с</div>
                                <div className="profile-info-value">{formatDate(profile.created_at)}</div>
                            </div>

                            {/* E2E */}
                            {profile.public_keys && (
                                <div className="profile-info-section">
                                    <div className="profile-info-label">Шифрование</div>
                                    <div className="profile-info-value profile-e2e-row">
                                        {Icon.shield(14)}
                                        <span>E2E включено</span>
                                        <code className="profile-key-id">{profile.public_keys.key_id.slice(0, 16)}…</code>
                                    </div>
                                </div>
                            )}

                            {/* Миниатюры аватарок */}
                            {avatars.length > 1 && (
                                <div className="profile-avatars-section">
                                    <div className="profile-info-label">Фотографии ({avatars.length})</div>
                                    <div className="profile-avatar-thumbs">
                                        {avatars.map((a, i) => (
                                            <div
                                                key={a.id}
                                                className={`profile-thumb ${a.is_current ? 'current' : ''}`}
                                                onClick={() => openGallery(i)}
                                            >
                                                <img
                                                    src={fullUrl(a.url)}
                                                    alt=""
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Действия */}
                            <div className="profile-actions">
                                {isMe ? (
                                    <button className="profile-action-btn" onClick={onEdit}>
                                        {Icon.edit(16)} Редактировать
                                    </button>
                                ) : (
                                    <>
                                        <button className="profile-action-btn primary" onClick={() => onMessage(userId)}>
                                            {Icon.chat(16)} Сообщение
                                        </button>
                                        <button className="profile-action-btn" onClick={() => onCall(userId)}>
                                            {Icon.phone(16)} Позвонить
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {galleryOpen && galleryUrls.length > 0 && (
                <AvatarGallery
                    urls={galleryUrls}
                    dates={galleryDates}
                    startIndex={galleryIndex}
                    onClose={() => setGalleryOpen(false)}
                />
            )}
        </>
    );
}