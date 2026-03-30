import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { AvatarGallery } from '../ui/AvatarGallery';
import * as api from '../../api';
import { SERVER_URL } from '../../api';
import type { UserDto, AvatarHistoryDto } from '../../types';
import { cryptoManager } from '../../crypto';
import { isNotificationEnabled, requestNotificationPermission, sendTestNotification } from '../../notifications';

interface Props {
    darkMode: boolean;
    onToggleTheme: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
    user: UserDto | null;
    onUserUpdate?: (user: UserDto) => void;
}

function fullUrl(url: string): string {
    if (url.startsWith('http')) return url;
    return `${SERVER_URL}${url}`;
}

export function SettingsView({ darkMode, onToggleTheme, showToast, user, onUserUpdate }: Props) {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [settingUpE2E, setSettingUpE2E] = useState(false);
    const [e2eEnabled, setE2eEnabled] = useState(() => cryptoManager.hasKeys());
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Bio ──────────────────────────────────────────────
    const [bio, setBio] = useState(user?.bio || '');
    const [bioChanged, setBioChanged] = useState(false);
    const [savingBio, setSavingBio] = useState(false);

    // ── Avatar History ──────────────────────────────────
    const [avatarHistory, setAvatarHistory] = useState<AvatarHistoryDto[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);

    // ── Notifications ───────────────────────────────────
    const [isNotifEnabled, setIsNotifEnabled] = useState(() => isNotificationEnabled());

    // ── Загрузка профиля при монтировании ───────────────
    const fetchProfile = useCallback(async () => {
        if (!user) return;
        setLoadingHistory(true);
        try {
            const profile = await api.getUserProfile(user.id);
            setAvatarHistory(profile.avatars);
            setBio(profile.bio);
            setBioChanged(false);
        } catch (e) {
            console.warn('Failed to load profile:', e);
        } finally {
            setLoadingHistory(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // ── Сохранение Bio ──────────────────────────────────
    const handleSaveBio = async () => {
        if (!bioChanged) return;
        setSavingBio(true);
        try {
            const updated = await api.updateProfile({ bio });
            setBioChanged(false);
            showToast('Био обновлено', 'success');
            if (onUserUpdate) onUserUpdate(updated);
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        } finally {
            setSavingBio(false);
        }
    };

    // ── Аватарка: загрузка ──────────────────────────────
    const handleAvatarClick = () => { fileInputRef.current?.click(); };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Выберите изображение', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой (макс 5MB)', 'error'); return; }

        setUploadingAvatar(true);
        try {
            const result = await api.uploadAvatar(file);
            showToast('Аватарка обновлена!', 'success');
            if (user && onUserUpdate) onUserUpdate({ ...user, avatar_url: result.avatar_url });
            await fetchProfile();
        } catch (e: any) {
            showToast(e.message || 'Ошибка загрузки', 'error');
        } finally {
            setUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Аватарка: снять текущую ─────────────────────────
    const handleDeleteAvatar = async () => {
        if (!user?.avatar_url) return;
        try {
            await api.deleteAvatar();
            showToast('Аватарка снята', 'success');
            if (user && onUserUpdate) onUserUpdate({ ...user, avatar_url: undefined });
            await fetchProfile();
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        }
    };

    // ── Аватарка: удалить из истории ─────────────────────
    const handleDeleteFromHistory = async (avatarId: string) => {
        try {
            await api.deleteAvatarHistory(avatarId);
            showToast('Удалено из истории', 'success');
            await fetchProfile();
            // Если удалили текущую — обновляем user
            const entry = avatarHistory.find(a => a.id === avatarId);
            if (entry?.is_current && user && onUserUpdate) {
                onUserUpdate({ ...user, avatar_url: undefined });
            }
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        }
    };

    // ── Аватарка: поставить из истории ───────────────────
    const handleSetFromHistory = async (avatarId: string) => {
        try {
            const result = await api.setAvatarFromHistory(avatarId);
            showToast('Аватарка установлена!', 'success');
            if (user && onUserUpdate) onUserUpdate({ ...user, avatar_url: result.avatar_url });
            await fetchProfile();
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        }
    };

    // ── Галерея ─────────────────────────────────────────
    const openGallery = (index: number) => {
        setGalleryIndex(index);
        setGalleryOpen(true);
    };

    const galleryUrls = avatarHistory.map(a => fullUrl(a.url));
    const galleryDates = avatarHistory.map(a => a.set_at);

    // ── Уведомления ─────────────────────────────────────
    const handleTestNotif = async () => {
        await sendTestNotification();
        showToast('Тестовое уведомление отправлено', 'info');
    };

    const handleEnableNotifs = async () => {
        const granted = await requestNotificationPermission();
        setIsNotifEnabled(granted);
        if (granted) showToast('Уведомления включены!', 'success');
        else showToast('Браузер заблокировал уведомления.', 'error');
    };

    // ── Инвайты ─────────────────────────────────────────
    const handleCreateInvite = async () => {
        setCreatingInvite(true);
        try {
            const invite = await api.createInvite(48);
            setInviteCode(invite.code);
            showToast('Инвайт-код создан!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        } finally { setCreatingInvite(false); }
    };

    const copyInvite = () => {
        if (inviteCode) {
            navigator.clipboard.writeText(inviteCode);
            showToast('Код скопирован', 'success');
        }
    };

    // ── E2E ─────────────────────────────────────────────
    const handleSetupE2E = async () => {
        setSettingUpE2E(true);
        try {
            const publicKeys = await cryptoManager.generateKeys();
            const updatedUser = await api.updateProfile({ public_keys: publicKeys });
            setE2eEnabled(true);
            showToast('E2E шифрование настроено!', 'success');
            if (onUserUpdate) onUserUpdate(updatedUser);
        } catch (e: any) {
            showToast(e.message || 'Ошибка', 'error');
        } finally { setSettingUpE2E(false); }
    };

    const handleResetE2E = async () => {
        if (!confirm('Сбросить ключи шифрования?')) return;
        try {
            const publicKeys = await cryptoManager.generateKeys();
            const updatedUser = await api.updateProfile({ public_keys: publicKeys });
            setE2eEnabled(true);
            showToast('Ключи обновлены.', 'success');
            if (onUserUpdate) onUserUpdate(updatedUser);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const keyId = cryptoManager.getKeyId();

    return (
        <section className="settings-view">
            <div className="settings-inner">
                <h2 className="settings-title">Настройки</h2>

                {/* ── Профиль ──────────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">Профиль</div>
                    <div className="s-profile">
                        <div className="avatar-edit-wrap" onClick={handleAvatarClick}>
                            <Avatar name={user?.display_name || 'User'} size={72} avatarUrl={user?.avatar_url} />
                            <div className="avatar-edit-overlay">
                                {uploadingAvatar ? <span className="avatar-loading">…</span> : Icon.camera(24)}
                            </div>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                            style={{ display: 'none' }} onChange={handleFileChange} />
                        <div className="profile-info">
                            <strong>{user?.display_name || 'User'}</strong>
                            <span className="s-sub">@{user?.username || 'username'}</span>
                            {user?.avatar_url && (
                                <button className="avatar-delete-btn" onClick={handleDeleteAvatar}>
                                    Снять аватарку
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bio */}
                    <div className="s-bio-field">
                        <label className="s-bio-label">О себе</label>
                        <textarea
                            className="s-bio-input"
                            placeholder="Расскажите о себе…"
                            value={bio}
                            maxLength={200}
                            rows={3}
                            onChange={e => { setBio(e.target.value); setBioChanged(true); }}
                        />
                        <div className="s-bio-footer">
                            <span className="s-bio-counter">{bio.length}/200</span>
                            {bioChanged && (
                                <button className="s-bio-save" onClick={handleSaveBio} disabled={savingBio}>
                                    {savingBio ? 'Сохранение…' : 'Сохранить'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── История аватарок ─────────────────────── */}
                {avatarHistory.length > 0 && (
                    <div className="s-group">
                        <div className="s-group-label">История аватарок ({avatarHistory.length})</div>
                        <div className="s-avatar-history">
                            {avatarHistory.map((a, i) => (
                                <div key={a.id} className={`s-avatar-item ${a.is_current ? 'current' : ''}`}>
                                    <img
                                        src={fullUrl(a.url)}
                                        alt=""
                                        className="s-avatar-thumb"
                                        onClick={() => openGallery(i)}
                                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <div className="s-avatar-actions">
                                        {!a.is_current && (
                                            <button className="s-avatar-action-btn" onClick={() => handleSetFromHistory(a.id)} title="Установить">
                                                {Icon.check(14)}
                                            </button>
                                        )}
                                        <button className="s-avatar-action-btn danger" onClick={() => handleDeleteFromHistory(a.id)} title="Удалить">
                                            {Icon.trash(14)}
                                        </button>
                                    </div>
                                    {a.is_current && <span className="s-avatar-current-badge">Текущая</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── E2E ──────────────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">Сквозное шифрование (E2E)</div>
                    {e2eEnabled ? (
                        <div className="e2e-status-card">
                            <div className="e2e-status-header">
                                <span className="e2e-badge active">{Icon.shield(16)} Включено</span>
                            </div>
                            {keyId && (
                                <div className="e2e-key-row">
                                    <span className="e2e-key-label">Отпечаток:</span>
                                    <code className="e2e-key-value">{keyId}</code>
                                </div>
                            )}
                            <p className="e2e-hint">Каждый чат шифруется своим ключом.</p>
                            <button className="e2e-reset-btn" onClick={handleResetE2E}>Пересоздать ключи</button>
                        </div>
                    ) : (
                        <div className="e2e-setup-card">
                            <div className="e2e-setup-icon">{Icon.lock(32)}</div>
                            <h3 className="e2e-setup-title">Шифрование не настроено</h3>
                            <p className="e2e-setup-desc">Настройте сквозное шифрование.</p>
                            <ul className="e2e-features">
                                <li>{Icon.check(14)} Отдельный ключ для каждого чата</li>
                                <li>{Icon.check(14)} Сервер не видит содержимое</li>
                                <li>{Icon.check(14)} ECIES + AES-256-GCM</li>
                            </ul>
                            <button className="e2e-setup-btn" onClick={handleSetupE2E} disabled={settingUpE2E}>
                                {settingUpE2E ? 'Генерация ключей...' : <>{Icon.shield(16)} Настроить E2E</>}
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Инвайты ──────────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">Пригласить друга</div>
                    {inviteCode ? (
                        <div className="invite-result">
                            <div className="invite-code">{inviteCode}</div>
                            <button className="invite-copy-btn" onClick={copyInvite}>{Icon.copy(16)} Копировать</button>
                            <button className="invite-new-btn" onClick={handleCreateInvite}>Создать новый</button>
                            <p className="invite-hint">Действителен 48 часов. Одноразовый.</p>
                        </div>
                    ) : (
                        <button className="s-row invite-create-btn" onClick={handleCreateInvite} disabled={creatingInvite}>
                            <span className="s-row-left">{Icon.plus(19)} {creatingInvite ? 'Создаётся...' : 'Создать инвайт-код'}</span>
                            <span className="s-arrow">→</span>
                        </button>
                    )}
                </div>

                {/* ── Уведомления ──────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">Уведомления</div>
                    {isNotifEnabled ? (
                        <>
                            <div className="s-row">
                                <span className="s-row-left">{Icon.check(19)} Уведомления включены</span>
                                <span className="e2e-badge active" style={{ fontSize: 11 }}>✓ Активно</span>
                            </div>
                            <button className="s-row" onClick={handleTestNotif}>
                                <span className="s-row-left">🔔 Тестовое уведомление</span>
                                <span className="s-arrow">→</span>
                            </button>
                        </>
                    ) : (
                        <button className="s-row" onClick={handleEnableNotifs}>
                            <span className="s-row-left">🔔 Включить уведомления</span>
                            <span className="s-arrow">→</span>
                        </button>
                    )}
                </div>

                {/* ── Тема ─────────────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">Внешний вид</div>
                    <button className="s-row" onClick={onToggleTheme}>
                        <span className="s-row-left">{darkMode ? Icon.moon(19) : Icon.sun(19)} Тёмная тема</span>
                        <span className={`toggle ${darkMode ? 'on' : ''}`}><span className="toggle-dot" /></span>
                    </button>
                </div>

                {/* ── О приложении ─────────────────────────── */}
                <div className="s-group">
                    <div className="s-group-label">О приложении</div>
                    <div className="s-row">
                        <span className="s-row-left">Версия</span>
                        <span className="s-sub">0.4.0-alpha (Profiles)</span>
                    </div>
                </div>
            </div>

            {/* Галерея аватарок */}
            {galleryOpen && galleryUrls.length > 0 && (
                <AvatarGallery
                    urls={galleryUrls}
                    dates={galleryDates}
                    startIndex={galleryIndex}
                    onClose={() => setGalleryOpen(false)}
                />
            )}
        </section>
    );
}