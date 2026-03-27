import React, { useState } from 'react';
import type { AuthTab } from '../../types';
import { Icon } from '../../icons';

interface Props {
    onLogin: () => void;
}

export function AuthScreen({ onLogin }: Props) {
    const [mode, setMode] = useState<AuthTab>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [invite, setInvite] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin();
    };

    return (
        <div className="auth-screen">
            <div className="auth-card">
                {/* Логотип */}
                <div className="auth-logo">
                    <div className="auth-icon-wrap">{Icon.shield(32)}</div>
                    <h1>Messenger</h1>
                    <p>Encrypted · Private · Yours</p>
                </div>

                {/* Табы */}
                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => setMode('login')}
                    >
                        Вход
                    </button>
                    <button
                        className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                        onClick={() => setMode('register')}
                    >
                        Регистрация
                    </button>
                </div>

                {/* Форма */}
                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="field">
                        <label>Имя пользователя</label>
                        <input
                            type="text"
                            placeholder="Введите имя..."
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="field">
                        <label>Пароль</label>
                        <input
                            type="password"
                            placeholder="Введите пароль..."
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                    {mode === 'register' && (
                        <div className="field fade-in">
                            <label>Инвайт-код</label>
                            <input
                                type="text"
                                placeholder="Введите код приглашения..."
                                value={invite}
                                onChange={e => setInvite(e.target.value)}
                            />
                        </div>
                    )}
                    <button type="submit" className="auth-btn">
                        {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                    </button>
                </form>

                {/* Фичи */}
                <div className="auth-features">
                    <div className="auth-feat">{Icon.lock(15)}<span>E2E шифрование</span></div>
                    <div className="auth-feat">{Icon.shield(15)}<span>Без сбора данных</span></div>
                    <div className="auth-feat">{Icon.users(15)}<span>По приглашениям</span></div>
                </div>
            </div>
        </div>
    );
}