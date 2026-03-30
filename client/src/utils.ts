import type { LocalChat, LocalMessage } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

const AVATAR_COLORS = [
    '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71',
    '#1abc9c', '#3498db', '#9b59b6', '#e91e8a',
];

export const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

export const getAvatarColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

export const getNow = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) {
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) {
            return 'Вчера';
        }
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    } catch {
        return '';
    }
}

const MONTH_NAMES = [
    'янв', 'фев', 'мар', 'апр', 'май', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
        return '';
    }
}

export function formatDateFull(iso: string): string {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
        return '';
    }
}

/** Получить превью последнего сообщения для списка чатов */
export function getChatPreview(chat: LocalChat): { text: string; time: string } {
    if (chat.messages.length > 0) {
        const m = chat.messages[chat.messages.length - 1];
        const prefix = chat.is_group && !m.own
            ? `${m.sender_name}: `
            : m.own ? 'Вы: ' : '';
        const full = prefix + m.content;
        return {
            text: full.length > 42 ? full.slice(0, 42) + '…' : full,
            time: formatTime(m.created_at),
        };
    }

    if (chat.lastMessageText) {
        return {
            text: chat.lastMessageText.length > 42
                ? chat.lastMessageText.slice(0, 42) + '…'
                : chat.lastMessageText,
            time: chat.lastMessageTime,
        };
    }

    return { text: 'Нет сообщений', time: '' };
}