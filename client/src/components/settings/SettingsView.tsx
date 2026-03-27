// client/src/components/settings/SettingsView.tsx

import React, { useState, useRef } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import * as api from '../../api';
import type { UserDto } from '../../types';

interface Props {
    darkMode: boolean;
    onToggleTheme: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
    user: UserDto | null;
    onUserUpdate?: (user: UserDto) => void;
}

export function SettingsView({ darkMode, onToggleTheme, showToast, user, onUserUpdate }: Props) {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateInvite = async () => {
        setCreatingInvite(true);
        try {
            const invite = await api.createInvite(48);
            setInviteCode(invite.code);
            showToast('Инвайт-код создан!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Ошибка создания инвайта', 'error');
        } finally {
            setCreatingInvite(false);
        }
    };

    const copyInvite = () => {
        if (inviteCode) {
            navigator.clipboard.writeText(inviteCode);
            showToast('Код скопирован в буфер обмена', 'success');
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Проверка типа
        if (!file.type.startsWith('image/')) {
            showToast('Выберите изображение', 'error');
            return;
        }

        // Проверка размера (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 5MB)', 'error');
            return;
        }

        setUploadingAvatar(true);
        try {
            const result = await api.uploadAvatar(file);
            showToast('Аватарка обновлена!', 'success');

            // Обновляем юзера локально
            if (user && onUserUpdate) {
                onUserUpdate({ ...user, avatar_url: result.avatar_url });
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка загрузки аватарки', 'error');
        } finally {
            setUploadingAvatar(false);
            // Сбрасываем input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDeleteAvatar = async () => {
        if (!user?.avatar_url) return;

        try {
            await api.deleteAvatar();
            showToast('Аватарка удалена', 'success');

            if (user && onUserUpdate) {
                onUserUpdate({ ...user, avatar_url: undefined });
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка удаления', 'error');
        }
    };

    return (
        <section className="settings-view">
            <div className="settings-inner">
                <h2 className="settings-title">Настройки</h2>

                {/* Профиль с аватаркой */}
                <div className="s-group">
                    <div className="s-group-label">Профиль</div>
                    <div className="s-profile">
                        <div className="avatar-edit-wrap" onClick={handleAvatarClick}>
                            <Avatar
                                name={user?.display_name || 'User'}
                                size={72}
                                avatarUrl={user?.avatar_url}
                            />
                            <div className="avatar-edit-overlay">
                                {uploadingAvatar ? (
                                    <span className="avatar-loading">...</span>
                                ) : (
                                    Icon.camera(24)
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                        <div className="profile-info">
                            <strong>{user?.display_name || 'User'}</strong>
                            <span className="s-sub">@{user?.username || 'username'}</span>
                            {user?.avatar_url && (
                                <button className="avatar-delete-btn" onClick={handleDeleteAvatar}>
                                    Удалить фото
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* E2E шифрование */}
                <div className="s-group">
                    <div className="s-group-label">Шифрование</div>
                    <div className="s-row">
                        <span className="s-row-left">
                            {Icon.shield(19)} E2E шифрование
                        </span>
                        <span className={`e2e-status ${user?.public_keys ? 'active' : ''}`}>
                            {user?.public_keys ? '✓ Включено' : 'Не настроено'}
                        </span>
                    </div>
                    {user?.public_keys && (
                        <div className="s-row key-info">
                            <span className="s-row-left">
                                {Icon.lock(16)} Key ID
                            </span>
                            <code className="key-id">{user.public_keys.key_id.slice(0, 16)}...</code>
                        </div>
                    )}
                </div>

                {/* Инвайты */}
                <div className="s-group">
                    <div className="s-group-label">Пригласить друга</div>

                    {inviteCode ? (
                        <div className="invite-result">
                            <div className="invite-code">{inviteCode}</div>
                            <button className="invite-copy-btn" onClick={copyInvite}>
                                {Icon.copy(16)} Копировать
                            </button>
                            <button className="invite-new-btn" onClick={handleCreateInvite}>
                                Создать новый
                            </button>
                            <p className="invite-hint">Действителен 48 часов. Одноразовый.</p>
                        </div>
                    ) : (
                        <button className="s-row invite-create-btn" onClick={handleCreateInvite} disabled={creatingInvite}>
                            <span className="s-row-left">
                                {Icon.plus(19)} {creatingInvite ? 'Создаётся...' : 'Создать инвайт-код'}
                            </span>
                            <span className="s-arrow">→</span>
                        </button>
                    )}
                </div>

                {/* Внешний вид */}
                <div className="s-group">
                    <div className="s-group-label">Внешний вид</div>
                    <button className="s-row" onClick={onToggleTheme}>
                        <span className="s-row-left">
                            {darkMode ? Icon.moon(19) : Icon.sun(19)}
                            Тёмная тема
                        </span>
                        <span className={`toggle ${darkMode ? 'on' : ''}`}>
                            <span className="toggle-dot" />
                        </span>
                    </button>
                </div>

                {/* О приложении */}
                <div className="s-group">
                    <div className="s-group-label">О приложении</div>
                    <div className="s-row">
                        <span className="s-row-left">Версия</span>
                        <span className="s-sub">0.2.0-alpha (E2E)</span>
                    </div>
                </div>
            </div>
        </section>
    );
}