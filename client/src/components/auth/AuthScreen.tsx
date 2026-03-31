import React, { useState } from 'react';
import { Shield, Lock, Users } from 'lucide-react';
import type { AuthTab } from '../../types';

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
            if (mode === 'login') await onLogin(username, password);
            else await onRegister(username, password, displayName || username, invite || undefined);
        } catch (err: any) {
            setError(err.message || 'Произошла ошибка');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (m: AuthTab) => { setMode(m); setError(''); };

    const input = (label: string, type: string, value: string, onChange: (v: string) => void, opts?: { required?: boolean; minLength?: number; placeholder?: string; autoFocus?: boolean }) => (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 ml-1">{label}</label>
            <input type={type} placeholder={opts?.placeholder || ''} className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-[#16161e] border border-gray-200 dark:border-white/5 focus:border-accent outline-none transition-all" value={value} onChange={e => onChange(e.target.value)} required={opts?.required} minLength={opts?.minLength} />
        </div>
    );

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-[#0c0c10] p-4 relative overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative w-full max-w-[380px] p-8 rounded-3xl bg-white dark:bg-[#18181f] border border-gray-200 dark:border-white/5 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-accent/10 text-accent"><Shield size={32} /></div>
                    <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">Messenger</h1>
                    <p className="text-sm text-gray-500">Encrypted · Private · Yours</p>
                </div>

                <div className="flex p-1 bg-gray-100 dark:bg-[#1a1a24] rounded-xl mb-6">
                    {(['login', 'register'] as AuthTab[]).map(m => (
                        <button key={m} type="button" className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${mode === m ? 'bg-white dark:bg-accent text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`} onClick={() => switchMode(m)}>
                            {m === 'login' ? 'Вход' : 'Регистрация'}
                        </button>
                    ))}
                </div>

                {error && <div className="p-3 mb-4 text-sm font-medium text-center text-red-500 bg-red-500/10 rounded-xl">{error}</div>}

                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    {input('Имя пользователя', 'text', username, setUsername, { required: true, minLength: 3, placeholder: 'Введите имя...' })}
                    {mode === 'register' && input('Отображаемое имя', 'text', displayName, setDisplayName, { placeholder: 'Как вас называть...' })}
                    {input('Пароль', 'password', password, setPassword, { required: true, minLength: 6, placeholder: 'Введите пароль...' })}
                    {mode === 'register' && input('Инвайт-код', 'text', invite, setInvite, { placeholder: 'Код приглашения (опционально)...' })}
                    <button type="submit" disabled={loading} className="mt-2 w-full py-3.5 rounded-xl font-bold text-white bg-accent hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 transition-all shadow-[0_4px_20px_rgba(99,102,241,0.3)]">
                        {loading ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                    </button>
                </form>

                <div className="flex justify-center gap-4 mt-6 pt-5 border-t border-gray-200 dark:border-white/5">
                    {[{ icon: Lock, text: 'E2E' }, { icon: Shield, text: 'Private' }, { icon: Users, text: 'Invites' }].map(({ icon: I, text }) => (
                        <div key={text} className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400"><I size={14} /> {text}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}