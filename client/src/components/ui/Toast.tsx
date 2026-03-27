import React from 'react';
import type { ToastData } from '../../types';

export function ToastContainer({ toasts }: { toasts: ToastData[] }) {
    if (!toasts.length) return null;

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type || 'info'}`}>
                    {t.text}
                </div>
            ))}
        </div>
    );
}