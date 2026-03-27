import type { Chat } from './types';

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

export const getLastMessage = (chat: Chat) => {
    const m = chat.messages[chat.messages.length - 1];
    if (!m) return { text: 'Нет сообщений', time: '' };
    const prefix = chat.group && !m.own ? `${m.author}: ` : m.own ? 'Вы: ' : '';
    const full = prefix + m.text;
    return { text: full.length > 42 ? full.slice(0, 42) + '…' : full, time: m.time };
};