import { useState, useCallback, useEffect } from 'react';
import type { UserDto } from '../types';
import * as api from '../api';
import { wsManager } from '../websocket';

export function useAuth() {
    const [user, setUser] = useState<UserDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // При старте — проверяем есть ли сохранённый токен
    useEffect(() => {
        const token = api.getToken();
        if (token) {
            api.getMe()
                .then(u => {
                    setUser(u);
                    wsManager.connect();
                })
                .catch(() => {
                    api.setToken(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        setError(null);
        try {
            const res = await api.login(username, password);
            setUser(res.user);
            wsManager.connect();
        } catch (e: any) {
            setError(e.message || 'Ошибка входа');
            throw e;
        }
    }, []);

    const register = useCallback(async (
        username: string,
        password: string,
        display_name: string,
        invite_code?: string,
    ) => {
        setError(null);
        try {
            const res = await api.register(username, password, display_name, invite_code);
            setUser(res.user);
            wsManager.connect();
        } catch (e: any) {
            setError(e.message || 'Ошибка регистрации');
            throw e;
        }
    }, []);

    const logout = useCallback(() => {
        api.logout();
        wsManager.disconnect();
        setUser(null);
    }, []);

    return { user, loading, error, login, register, logout };
}