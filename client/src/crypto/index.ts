import { keystore } from './keystore';
import type { EncryptedChatKey, EncryptedPayload } from '../types';

const STORAGE_KEY = 'e2e_keys';
const ALGORITHM = 'AES-GCM';

export interface StoredKeys {
    identityKeyPair: { publicKey: string; privateKey: string };
    keyId: string;
}

export interface ExportedPublicKeys {
    identity_key: string;
    signing_key: string;
    signature: string;
    key_id: string;
}

function ab2b64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function b642ab(base64: string): ArrayBuffer {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function generateKeyId(pubKey: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', pubKey);
    return ab2b64(hash).slice(0, 32);
}

class E2ECryptoManager {
    private keys: StoredKeys | null = null;
    private chatKeys: Map<string, CryptoKey> = new Map();

    async initialize(): Promise<ExportedPublicKeys | null> {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.keys = JSON.parse(stored);
                return this.getPublicKeys();
            } catch (e) {
                console.error('[E2E] Load failed:', e);
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        return null;
    }

    async generateKeys(): Promise<ExportedPublicKeys> {
        this.chatKeys.clear();
        await keystore.clearSessionKeys();

        const idKP = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );

        const idPubExp = await crypto.subtle.exportKey('spki', idKP.publicKey);
        const idPubB64 = ab2b64(idPubExp);
        const kid = await generateKeyId(idPubExp);
        const idPrivExp = await crypto.subtle.exportKey('pkcs8', idKP.privateKey);

        this.keys = {
            identityKeyPair: { publicKey: idPubB64, privateKey: ab2b64(idPrivExp) },
            keyId: kid,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));
        console.log('[E2E] Identity generated:', kid);

        return {
            identity_key: idPubB64,
            signing_key: idPubB64,
            signature: 'NA',
            key_id: kid,
        };
    }

    getPublicKeys(): ExportedPublicKeys | null {
        if (!this.keys) return null;
        return {
            identity_key: this.keys.identityKeyPair.publicKey,
            signing_key: this.keys.identityKeyPair.publicKey,
            signature: 'NA',
            key_id: this.keys.keyId,
        };
    }

    getKeyId(): string | null {
        return this.keys?.keyId || null;
    }

    hasKeys(): boolean {
        return this.keys !== null;
    }

    hasChatKey(chatId: string): boolean {
        return this.chatKeys.has(chatId);
    }

    getChatKey(chatId: string): CryptoKey | undefined {
        return this.chatKeys.get(chatId);
    }

    setChatKey(chatId: string, key: CryptoKey) {
        this.chatKeys.set(chatId, key);
    }

    // ── Генерация ключа чата ──────────────────────────────────

    async generateChatKey(): Promise<CryptoKey> {
        return await crypto.subtle.generateKey(
            { name: ALGORITHM, length: 256 },
            true,
            ['encrypt', 'decrypt'],
        );
    }

    // ── Обернуть ключ чата для получателя (ECIES) ─────────────

    async wrapChatKey(chatKey: CryptoKey, recipientPubKeyB64: string): Promise<EncryptedChatKey> {
        const rawChatKey = await crypto.subtle.exportKey('raw', chatKey);

        const ephPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits'],
        );
        const ephPubExp = await crypto.subtle.exportKey('spki', ephPair.publicKey);
        const ephPubB64 = ab2b64(ephPubExp);

        const recipientPub = await crypto.subtle.importKey(
            'spki',
            b642ab(recipientPubKeyB64),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
        );

        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: recipientPub },
            ephPair.privateKey,
            256,
        );

        const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveKey']);
        const wrapKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('chat-key-wrap') },
            hkdfKey,
            { name: ALGORITHM, length: 256 },
            false,
            ['encrypt'],
        );

        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: ALGORITHM, iv: nonce },
            wrapKey,
            rawChatKey,
        );

        return {
            ephemeral_pub: ephPubB64,
            ciphertext: ab2b64(ciphertext),
            nonce: ab2b64(nonce.buffer),
        };
    }

    // ── Развернуть ключ чата, полученный с сервера ────────────

    async unwrapChatKey(chatId: string, encChatKey: EncryptedChatKey): Promise<void> {
        if (!this.keys) throw new Error('No identity keys');

        const myPriv = await crypto.subtle.importKey(
            'pkcs8',
            b642ab(this.keys.identityKeyPair.privateKey),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits'],
        );

        const ephPub = await crypto.subtle.importKey(
            'spki',
            b642ab(encChatKey.ephemeral_pub),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
        );

        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: ephPub },
            myPriv,
            256,
        );

        const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, ['deriveKey']);
        const unwrapKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('chat-key-wrap') },
            hkdfKey,
            { name: ALGORITHM, length: 256 },
            false,
            ['decrypt'],
        );

        const rawChatKey = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: b642ab(encChatKey.nonce) },
            unwrapKey,
            b642ab(encChatKey.ciphertext),
        );

        const chatKey = await crypto.subtle.importKey(
            'raw',
            rawChatKey,
            { name: ALGORITHM, length: 256 },
            true,
            ['encrypt', 'decrypt'],
        );

        this.chatKeys.set(chatId, chatKey);

        try {
            await keystore.saveSessionKey(chatId, rawChatKey, this.keys.keyId);
        } catch (e) {
            console.warn('[E2E] Failed to cache chat key:', e);
        }

        console.log('[E2E] Unwrapped chat key for', chatId);
    }

    // ── Загрузка ключа чата из кэша ──────────────────────────

    async loadChatKeyFromCache(chatId: string): Promise<boolean> {
        if (this.chatKeys.has(chatId)) return true;
        if (!this.keys) return false;

        const cached = await keystore.getSessionKey(chatId);
        if (cached && cached.peerPublicKey === this.keys.keyId) {
            try {
                const chatKey = await crypto.subtle.importKey(
                    'raw',
                    new Uint8Array(cached.key).buffer,
                    { name: ALGORITHM, length: 256 },
                    true,
                    ['encrypt', 'decrypt'],
                );
                this.chatKeys.set(chatId, chatKey);
                console.log('[E2E] Chat key loaded from cache:', chatId);
                return true;
            } catch (e) {
                console.warn('[E2E] Cache restore failed:', e);
                await keystore.deleteSessionKey(chatId);
            }
        }
        return false;
    }

    // ── Сохранить ключ чата в кэш напрямую ───────────────────

    async saveChatKeyToCache(chatId: string, chatKey: CryptoKey): Promise<void> {
        if (!this.keys) return;
        try {
            const raw = await crypto.subtle.exportKey('raw', chatKey);
            await keystore.saveSessionKey(chatId, raw, this.keys.keyId);
        } catch (e) {
            console.warn('[E2E] Failed to save chat key to cache:', e);
        }
    }

    // ── Шифрование текста ────────────────────────────────────

    async encrypt(chatId: string, plaintext: string): Promise<EncryptedPayload> {
        const key = this.chatKeys.get(chatId);
        if (!key) throw new Error(`No chat key for ${chatId}`);
        const data = new TextEncoder().encode(plaintext);
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const enc = await crypto.subtle.encrypt({ name: ALGORITHM, iv: nonce }, key, data);
        return { ciphertext: ab2b64(enc), nonce: ab2b64(nonce.buffer) };
    }

    // ── Расшифровка текста ───────────────────────────────────

    async decrypt(chatId: string, ciphertext: string, nonce: string, messageId?: string): Promise<string> {
        if (messageId) {
            const cached = await keystore.getDecryptedMessage(messageId);
            if (cached !== undefined) return cached;
        }

        const key = this.chatKeys.get(chatId);
        if (!key) throw new Error(`No chat key for ${chatId}`);
        const dec = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: b642ab(nonce) },
            key,
            b642ab(ciphertext),
        );
        const plaintext = new TextDecoder().decode(dec);

        if (messageId) {
            await keystore.saveDecryptedMessage(messageId, plaintext);
        }

        return plaintext;
    }

    // ── Шифрование бинарных данных (голосовые) ───────────────

    async encryptBuffer(chatId: string, data: ArrayBuffer): Promise<{ encryptedData: ArrayBuffer; nonce: string }> {
        const key = this.chatKeys.get(chatId);
        if (!key) throw new Error(`No chat key for ${chatId}`);
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const enc = await crypto.subtle.encrypt({ name: ALGORITHM, iv: nonce }, key, data);
        return { encryptedData: enc, nonce: ab2b64(nonce.buffer) };
    }

    // ── Расшифровка бинарных данных ─────────────────────────

    async decryptBuffer(chatId: string, data: ArrayBuffer, nonceB64: string, attachmentId?: string): Promise<ArrayBuffer> {
        if (attachmentId) {
            const cached = await keystore.getVoiceCache(attachmentId);
            if (cached) return cached;
        }
        const key = this.chatKeys.get(chatId);
        if (!key) throw new Error(`No chat key for ${chatId}`);
        const dec = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: b642ab(nonceB64) },
            key,
            data,
        );
        if (attachmentId) {
            await keystore.saveVoiceCache(attachmentId, dec);
        }
        return dec;
    }

    // ── Очистка ─────────────────────────────────────────────

    async clear(): Promise<void> {
        this.keys = null;
        this.chatKeys.clear();
        localStorage.removeItem(STORAGE_KEY);
        await keystore.clearAll();
    }
}

export const cryptoManager = new E2ECryptoManager();
export { keystore };