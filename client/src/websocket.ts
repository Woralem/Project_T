import type { WsClientMsg, WsServerMsg } from './types';
import { getToken, WS_URL } from './api';

type WsListener = (msg: WsServerMsg) => void;
type StatusListener = (connected: boolean) => void;

class WebSocketManager {
    private ws: WebSocket | null = null;
    private listeners: Set<WsListener> = new Set();
    private statusListeners: Set<StatusListener> = new Set();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 30000;
    private shouldReconnect = false;
    private _connected = false;

    connect() {
        const token = getToken();
        if (!token) return;

        this.shouldReconnect = true;
        this.cleanup();

        const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
        console.log('[WS] connecting...');

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            console.error('[WS] failed to create', e);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[WS] connected');
            this.reconnectDelay = 1000;
            this._connected = true;
            this.notifyStatus(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg: WsServerMsg = JSON.parse(event.data);
                this.listeners.forEach(fn => fn(msg));
            } catch (e) {
                console.error('[WS] parse error', e);
            }
        };

        this.ws.onclose = (event) => {
            console.log('[WS] closed', event.code, event.reason);
            this._connected = false;
            this.notifyStatus(false);
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        };

        this.ws.onerror = () => {
            console.error('[WS] error');
        };
    }

    disconnect() {
        this.shouldReconnect = false;
        this._connected = false;
        this.cleanup();
        this.notifyStatus(false);
    }

    send(msg: WsClientMsg): boolean {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
            return true;
        }
        console.warn('[WS] not connected, message dropped');
        return false;
    }

    subscribe(fn: WsListener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    /** Подписка на изменение статуса соединения */
    onStatusChange(fn: StatusListener): () => void {
        this.statusListeners.add(fn);
        return () => this.statusListeners.delete(fn);
    }

    get connected(): boolean {
        return this._connected;
    }

    private notifyStatus(connected: boolean) {
        this.statusListeners.forEach(fn => fn(connected));
    }

    private cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
            this.ws = null;
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        console.log(`[WS] reconnecting in ${this.reconnectDelay}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }
}

export const wsManager = new WebSocketManager();