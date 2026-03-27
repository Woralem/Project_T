import { useState, useCallback } from 'react';
import type { ToastData } from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);

export function useToast() {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const showToast = useCallback((text: string, type: ToastData['type'] = 'info') => {
        const id = uid();
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    return { toasts, showToast };
}