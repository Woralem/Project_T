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
            try {
                const r = await Notification.requestPermission();
                return r === 'granted';
            } catch { return false; }
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