import React from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';

interface Props {
    darkMode: boolean;
    onToggleTheme: () => void;
    showToast: (text: string) => void;
}

export function SettingsView({ darkMode, onToggleTheme, showToast }: Props) {
    return (
        <section className="settings-view">
            <div className="settings-inner">
                <h2 className="settings-title">Настройки</h2>

                {/* Профиль */}
                <div className="s-group">
                    <div className="s-group-label">Профиль</div>
                    <div className="s-profile">
                        <Avatar name="User" size={56} />
                        <div>
                            <strong>User</strong>
                            <span className="s-sub">@username</span>
                        </div>
                    </div>
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