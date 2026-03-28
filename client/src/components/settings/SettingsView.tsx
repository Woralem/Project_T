import React, { useState, useRef } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import * as api from '../../api';
import type { UserDto } from '../../types';
import { cryptoManager } from '../../crypto';

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
    const [settingUpE2E, setSettingUpE2E] = useState(false);
    const [e2eEnabled, setE2eEnabled] = useState(() => cryptoManager.hasKeys());
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

        if (!file.type.startsWith('image/')) {
            showToast('Выберите изображение', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 5MB)', 'error');
            return;
        }

        setUploadingAvatar(true);
        try {
            const result = await api.uploadAvatar(file);
            showToast('Аватарка обновлена!', 'success');
            if (user && onUserUpdate) {
                onUserUpdate({ ...user, avatar_url: result.avatar_url });
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка загрузки аватарки', 'error');
        } finally {
            setUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
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

    const handleSetupE2E = async () => {
        setSettingUpE2E(true);
        try {
            const publicKeys = await cryptoManager.generateKeys();

            const updatedUser = await api.updateProfile({
                public_keys: publicKeys,
            });

            setE2eEnabled(true);
            showToast('E2E шифрование настроено! Откройте чаты чтобы включить шифрование.', 'success');

            if (onUserUpdate) {
                onUserUpdate(updatedUser);
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка настройки E2E', 'error');
            console.error('[E2E] Setup failed:', e);
        } finally {
            setSettingUpE2E(false);
        }
    };

    const handleResetE2E = async () => {
        if (!confirm('Сбросить ключи шифрования?\n\nВы потеряете доступ к зашифрованным чатам до тех пор, пока собеседники не обновят ключи.')) {
            return;
        }

        try {
            const publicKeys = await cryptoManager.generateKeys();
            const updatedUser = await api.updateProfile({ public_keys: publicKeys });

            setE2eEnabled(true);
            showToast('Ключи обновлены. Собеседники увидят уведомление.', 'success');

            if (onUserUpdate) {
                onUserUpdate(updatedUser);
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        }
    };

    const keyId = cryptoManager.getKeyId();

    return (
        <section className="settings-view">
            <div className="settings-inner">
                <h2 className="settings-title">Настройки</h2>

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
                                    <span className="avatar-loading">…</span>
                                ) : (
                                    Icon.camera(24)
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
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

                <div className="s-group">
                    <div className="s-group-label">Сквозное шифрование (E2E)</div>

                    {e2eEnabled ? (
                        <div className="e2e-status-card">
                            <div className="e2e-status-header">
                                <span className="e2e-badge active">{Icon.shield(16)} Включено</span>
                            </div>
                            {keyId && (
                                <div className="e2e-key-row">
                                    <span className="e2e-key-label">Отпечаток ключа:</span>
                                    <code className="e2e-key-value">{keyId}</code>
                                </div>
                            )}
                            <p className="e2e-hint">
                                Каждый чат шифруется своим ключом. Откройте чат для автоматической настройки шифрования. Если собеседник сменит устройство — вы увидите уведомление.
                            </p>
                            <button className="e2e-reset-btn" onClick={handleResetE2E}>
                                Пересоздать ключи
                            </button>
                        </div>
                    ) : (
                        <div className="e2e-setup-card">
                            <div className="e2e-setup-icon">{Icon.lock(32)}</div>
                            <h3 className="e2e-setup-title">Шифрование не настроено</h3>
                            <p className="e2e-setup-desc">
                                Настройте сквозное шифрование. Для каждого чата будет создан свой ключ шифрования.
                            </p>
                            <ul className="e2e-features">
                                <li>{Icon.check(14)} Отдельный ключ для каждого чата</li>
                                <li>{Icon.check(14)} Сервер не видит содержимое</li>
                                <li>{Icon.check(14)} ECIES + AES-256-GCM</li>
                            </ul>
                            <button
                                className="e2e-setup-btn"
                                onClick={handleSetupE2E}
                                disabled={settingUpE2E}
                            >
                                {settingUpE2E ? (
                                    <>Генерация ключей...</>
                                ) : (
                                    <>{Icon.shield(16)} Настроить E2E шифрование</>
                                )}
                            </button>
                        </div>
                    )}
                </div>

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

                <div className="s-group">
                    <div className="s-group-label">О приложении</div>
                    <div className="s-row">
                        <span className="s-row-left">Версия</span>
                        <span className="s-sub">0.3.0-alpha (Per-Chat E2E)</span>
                    </div>
                </div>
            </div>
        </section>
    );
}