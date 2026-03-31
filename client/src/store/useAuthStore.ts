import { create } from 'zustand';
import type { UserDto, PublicKeyBundle } from '../types';
import * as api from '../api';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';

interface AuthStore {
    user: UserDto | null;
    loading: boolean;
    setUser: (user: UserDto | null) => void;
    logout: () => void;
    init: () => Promise<void>;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string, displayName: string, inviteCode?: string, publicKeys?: PublicKeyBundle) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
    user: null,
    loading: true,
    setUser: (user) => set({ user }),

    logout: () => {
        api.logout();
        wsManager.disconnect();
        set({ user: null });
    },

    init: async () => {
        // Загружаем E2E ключи из localStorage
        await cryptoManager.initialize();

        if (api.getToken()) {
            try {
                const user = await api.getMe();
                set({ user, loading: false });
                wsManager.connect();
                return;
            } catch {
                api.setToken(null);
            }
        }
        set({ loading: false });
    },

    login: async (username, password) => {
        const res = await api.login(username, password);
        set({ user: res.user });
        wsManager.connect();
    },

    register: async (username, password, displayName, inviteCode, publicKeys) => {
        const res = await api.register(username, password, displayName, inviteCode, publicKeys);
        set({ user: res.user });
        wsManager.connect();
    },
}));