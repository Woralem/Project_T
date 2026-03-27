import React, { useState } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import * as api from '../../api';
import type { UserDto } from '../../types';

interface Props {
    darkMode: boolean;
    onToggleTheme: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
    user: UserDto | null;
}

export function SettingsView({ darkMode, onToggleTheme, showToast, user }: Props) {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [creatingInvite, setCreatingInvite] = useState(false);

    const handleCreateInvite = async () => {
        setCreatingInvite(true);
        try {
            const invite = await api.createInvite(48); // 48 часов
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

    return (
        <section className="settings-view">
            <div className="settings-inner">
                <h2 className="settings-title">Настройки</h2>

                {/* Профиль */}
                <div className="s-group">
                    <div className="s-group-label">Профиль</div>
                    <div className="s-profile">
                        <Avatar name={user?.display_name || 'User'} size={56} />
                        <div>
                            <strong>{user?.display_name || 'User'}</strong>
                            <span className="s-sub">@{user?.username || 'username'}</span>
                        </div>
                    </div>
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

                {/* Безопасность */}
                <div className="s-group">
                    <div className="s-group-label">Безопасность</div>
                    <button className="s-row" onClick={() => showToast('Ключи шифрования — в разработке')}>
                        <span className="s-row-left">{Icon.lock(19)} Ключи шифрования</span>
                        <span className="s-arrow">→</span>
                    </button>
                    <button className="s-row" onClick={() => showToast('Верификация контактов — в разработке')}>
                        <span className="s-row-left">{Icon.shield(19)} Верификация контактов</span>
                        <span className="s-arrow">→</span>
                    </button>
                </div>

                {/* О приложении */}
                <div className="s-group">
                    <div className="s-group-label">О приложении</div>
                    <div className="s-row">
                        <span className="s-row-left">Версия</span>
                        <span className="s-sub">0.1.0-alpha</span>
                    </div>
                </div>
            </div>
        </section>
    );
}