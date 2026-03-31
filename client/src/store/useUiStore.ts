import { create } from 'zustand';
import type { Tab } from '../types';

interface Toast { id: string; text: string; type: 'info' | 'success' | 'error'; }

interface AppNotification {
    id: string;
    chatId: string;
    chatName: string;
    senderName: string;
    senderAvatarUrl?: string;
    text: string;
    isGroup: boolean;
    createdAt: number;
}

interface UiStore {
    activeTab: Tab;
    darkMode: boolean;
    toasts: Toast[];
    notifications: AppNotification[];
    setActiveTab: (tab: Tab) => void;
    toggleDarkMode: () => void;
    showToast: (text: string, type?: Toast['type']) => void;
    removeToast: (id: string) => void;
    addNotification: (data: Omit<AppNotification, 'id' | 'createdAt'>) => void;
    removeNotification: (id: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
    activeTab: 'chats',
    darkMode: localStorage.getItem('dark_mode') !== 'false',
    toasts: [],
    notifications: [],
    setActiveTab: (activeTab) => set({ activeTab }),
    toggleDarkMode: () => {
        set((state) => {
            const next = !state.darkMode;
            localStorage.setItem('dark_mode', String(next));
            if (next) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return { darkMode: next };
        });
    },
    showToast: (text, type = 'info') => {
        const id = Math.random().toString(36).slice(2, 9);
        set((state) => ({ toasts: [...state.toasts, { id, text, type }] }));
        setTimeout(() => {
            set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
        }, 3000);
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
    addNotification: (data) => {
        const id = Math.random().toString(36).slice(2, 9);
        set((state) => ({
            notifications: [...state.notifications, { ...data, id, createdAt: Date.now() }].slice(-5),
        }));
        setTimeout(() => {
            set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) }));
        }, 5000);
    },
    removeNotification: (id) => set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) })),
}));