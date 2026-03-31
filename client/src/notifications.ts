let lastSoundTime = 0;

export function playNotificationSound(): void {
    const now = Date.now();
    if (now - lastSoundTime < 800) return;
    lastSoundTime = now;
    try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.volume = 0.4;
        audio.play().catch(() => { });
    } catch { /* */ }
}

export async function initNotifications(): Promise<boolean> {
    if ('Notification' in window) {
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
            const r = await Notification.requestPermission();
            return r === 'granted';
        }
    }
    return false;
}

export async function sendSystemNotification(
    title: string, body: string, tag?: string, onClick?: () => void,
): Promise<void> {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body, silent: true, tag: tag || undefined });
            if (onClick) { n.onclick = () => { window.focus(); onClick(); n.close(); }; }
            setTimeout(() => n.close(), 6000);
        } catch { /* */ }
    }
}

export function showMessageNotification(
    data: { chatId: string; chatName: string; senderName: string; text: string; isGroup: boolean },
    onClick?: () => void,
): void {
    playNotificationSound();
    const title = data.isGroup ? data.chatName : data.senderName;
    const rawBody = data.isGroup ? `${data.senderName}: ${data.text}` : data.text;
    const body = rawBody.length > 100 ? rawBody.slice(0, 100) + '…' : rawBody;
    if (document.hidden || !document.hasFocus()) {
        sendSystemNotification(title, body, `msg-${data.chatId}`, onClick);
    }
}

export function showCallNotification(callerName: string): void {
    if (document.hidden || !document.hasFocus()) {
        sendSystemNotification('Входящий звонок', callerName, 'incoming-call');
    }
}