import React from 'react';
import { Icon } from '../../icons';

export function EmptyState() {
    return (
        <section className="empty-state">
            <div className="empty-icon">{Icon.chat(56)}</div>
            <h2>Выберите чат</h2>
            <p>Нажмите на диалог слева, чтобы начать переписку</p>
        </section>
    );
}