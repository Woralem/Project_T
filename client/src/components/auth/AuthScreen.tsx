import React, { useState } from 'react';
import type { AuthTab } from '../../types';
import { Icon } from '../../icons';

interface Props {
    onLogin: (username: string, password: string) => Promise<void>;
    onRegister: (username: string, password: string, displayName: string, inviteCode?: string) => Promise<void>;
}

export function AuthScreen({ onLogin, onRegister }: Props) {
    const [mode, setMode] = useState<AuthTab>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [invite, setInvite] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'login') {
                await onLogin(username, password);
            } else {
                await onRegister(
                    username,
                    password,
                    displayName || username,
                    invite || undefined,
                );
            }
        } catch (err: any) {
            setError(err.message || 'Произошла ошибка');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-screen">
            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-icon-wrap">{Icon.shield(32)}</div>
                    <h1>Messenger</h1>
                    <p>Encrypted · Private · Yours</p>
                </div>

                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => { setMode('login'); setError(''); }}
                    >
                        Вход
                    </button>
                    <button
                        className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                        onClick={() => { setMode('register'); setError(''); }}
                    >
                        Регистрация
                    </button>
                </div>

                {error && (
                    <div className="auth-error">{error}</div>
                )}

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="field">
                        <label>Имя пользователя</label>
                        <input
                            type="text"
                            placeholder="Введите имя..."
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoFocus
                            required
                            minLength={3}
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="field fade-in">
                            <label>Отображаемое имя</label>
                            <input
                                type="text"
                                placeholder="Как вас называть..."
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                            />
                        </div>
                    )}

                    <div className="field">
                        <label>Пароль</label>
                        <input
                            type="password"
                            placeholder="Введите пароль..."
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="field fade-in">
                            <label>Инвайт-код</label>
                            <input
                                type="text"
                                placeholder="Код приглашения (если есть)..."
                                value={invite}
                                onChange={e => setInvite(e.target.value)}
                            />
                        </div>
                    )}

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                    </button>
                </form>

                <div className="auth-features">
                    <div className="auth-feat">{Icon.lock(15)}<span>E2E шифрование</span></div>
                    <div className="auth-feat">{Icon.shield(15)}<span>Без сбора данных</span></div>
                    <div className="auth-feat">{Icon.users(15)}<span>По приглашениям</span></div>
                </div>
            </div>
        </div>
    );
}