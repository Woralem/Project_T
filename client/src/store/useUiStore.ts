import { create } from 'zustand';
import type { Tab } from '../types';

interface Toast { id: string; text: string; type: 'info' | 'success' | 'error'; }

interface UiStore {
    activeTab: Tab;
    darkMode: boolean;
    toasts: Toast[];
    setActiveTab: (tab: Tab) => void;
    toggleDarkMode: () => void;
    showToast: (text: string, type?: Toast['type']) => void;
    removeToast: (id: string) => void;
}

export const useUiStore = create<UiStore>((set) => ({
    activeTab: 'chats',
    darkMode: localStorage.getItem('dark_mode') !== 'false',
    toasts: [],
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
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
}));