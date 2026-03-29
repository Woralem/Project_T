import type { NotificationData } from './types';

let tauriNotifModule: any = null;
let tauriChecked = false;

function isTauri(): boolean {
    return !!(window as any).__TAURI_INTERNALS__;
}

async function getTauriModule(): Promise<any> {
    if (tauriChecked) return tauriNotifModule;
    tauriChecked = true;
    if (!isTauri()) return null;
    try {
        tauriNotifModule = await import('@tauri-apps/plugin-notification');
        return tauriNotifModule;
    } catch (e) {
        console.warn('[Notif] Tauri plugin load failed:', e);
        return null;
    }
}

let lastSoundTime = 0;

export function playNotificationSound(): void {
    const now = Date.now();
    if (now - lastSoundTime < 800) return;
    lastSoundTime = now;
    try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => { });
    } catch { /* */ }
}

let _permissionGranted = false;

export async function initNotifications(): Promise<boolean> {
    const mod = await getTauriModule();
    if (mod) {
        try {
            let granted = await mod.isPermissionGranted();
            if (!granted) {
                const result = await mod.requestPermission();
                granted = result === 'granted';
            }
            _permissionGranted = granted;
        } catch { _permissionGranted = false; }
    } else if ('Notification' in window) {
        if (Notification.permission === 'granted') _permissionGranted = true;
        else if (Notification.permission !== 'denied') {
            try {
                const r = await Notification.requestPermission();
                _permissionGranted = r === 'granted';
            } catch { _permissionGranted = false; }
        }
    }
    return _permissionGranted;
}

export async function requestNotificationPermission(): Promise<boolean> {
    _permissionGranted = false;
    tauriChecked = false;
    tauriNotifModule = null;
    return initNotifications();
}

export function isNotificationEnabled(): boolean {
    return _permissionGranted;
}

export async function sendSystemNotification(
    title: string, body: string, tag?: string, onClick?: () => void,
): Promise<void> {
    const mod = await getTauriModule();
    if (mod) {
        try { await mod.sendNotification({ title, body }); } catch { /* */ }
    } else if ('Notification' in window && Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body, silent: true, tag: tag || undefined });
            if (onClick) { n.onclick = () => { window.focus(); onClick(); n.close(); }; }
            setTimeout(() => n.close(), 6000);
        } catch { /* */ }
    }
}

export function showMessageNotification(
    data: NotificationData, onClick?: () => void,
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

export async function sendTestNotification(): Promise<void> {
    playNotificationSound();
    await sendSystemNotification('Тест', 'Уведомления работают! 🎉', 'test');
}