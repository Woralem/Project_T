// client/src/crypto/index.ts

/**
 * E2E Encryption module using Web Crypto API
 * 
 * Используем:
 * - X25519 (через ECDH P-256 как fallback) для обмена ключами
 * - AES-256-GCM для шифрования сообщений
 * - Ed25519 (через ECDSA P-256) для подписей
 */

const STORAGE_KEY = 'e2e_keys';
const ALGORITHM = 'AES-GCM';

export interface KeyPair {
    publicKey: CryptoKey;
    privateKey: CryptoKey;
}

export interface StoredKeys {
    identityKeyPair: {
        publicKey: string;  // base64
        privateKey: string; // base64
    };
    signingKeyPair: {
        publicKey: string;
        privateKey: string;
    };
    keyId: string;
}

export interface ExportedPublicKeys {
    identity_key: string;
    signing_key: string;
    signature: string;
    key_id: string;
}

// ═══════════════════════════════════════════════════════════
//  Утилиты
// ═══════════════════════════════════════════════════════════

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function generateKeyId(publicKey: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', publicKey);
    return arrayBufferToBase64(hash).slice(0, 32);
}

// ═══════════════════════════════════════════════════════════
//  Генерация ключей
// ═══════════════════════════════════════════════════════════

async function generateIdentityKeyPair(): Promise<KeyPair> {
    // Используем ECDH P-256 (поддерживается везде)
    return crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    ) as Promise<KeyPair>;
}

async function generateSigningKeyPair(): Promise<KeyPair> {
    // Используем ECDSA P-256 для подписей
    return crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    ) as Promise<KeyPair>;
}

// ═══════════════════════════════════════════════════════════
//  Экспорт/импорт ключей
// ═══════════════════════════════════════════════════════════

async function exportKeyToBase64(key: CryptoKey, isPrivate = false): Promise<string> {
    const format = isPrivate ? 'pkcs8' : 'spki';
    const exported = await crypto.subtle.exportKey(format, key);
    return arrayBufferToBase64(exported);
}

async function importIdentityPublicKey(base64: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
    );
}

async function importIdentityPrivateKey(base64: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    );
}

async function importSigningPublicKey(base64: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
        'spki',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['verify']
    );
}

async function importSigningPrivateKey(base64: string): Promise<CryptoKey> {
    const keyData = base64ToArrayBuffer(base64);
    return crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
    );
}

// ═══════════════════════════════════════════════════════════
//  Подпись
// ═══════════════════════════════════════════════════════════

async function sign(privateKey: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    return crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        data
    );
}

async function verify(publicKey: CryptoKey, signature: ArrayBuffer, data: ArrayBuffer): Promise<boolean> {
    return crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signature,
        data
    );
}

// ═══════════════════════════════════════════════════════════
//  Diffie-Hellman и шифрование
// ═══════════════════════════════════════════════════════════

async function deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<CryptoKey> {
    // Derive bits using ECDH
    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: publicKey },
        privateKey,
        256
    );

    // Derive AES key from shared secret
    const sharedKey = await crypto.subtle.importKey(
        'raw',
        sharedBits,
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('e2e-messenger') },
        sharedKey,
        { name: ALGORITHM, length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(
    key: CryptoKey,
    plaintext: string
): Promise<{ ciphertext: string; nonce: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const nonce = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv: nonce },
        key,
        data
    );

    return {
        ciphertext: arrayBufferToBase64(encrypted),
        nonce: arrayBufferToBase64(nonce)
    };
}

async function decryptData(
    key: CryptoKey,
    ciphertext: string,
    nonce: string
): Promise<string> {
    const decoder = new TextDecoder();
    const encryptedData = base64ToArrayBuffer(ciphertext);
    const iv = base64ToArrayBuffer(nonce);

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        encryptedData
    );

    return decoder.decode(decrypted);
}

// ═══════════════════════════════════════════════════════════
//  Менеджер ключей
// ═══════════════════════════════════════════════════════════

class E2ECryptoManager {
    private keys: StoredKeys | null = null;
    private sessionKeys: Map<string, CryptoKey> = new Map(); // userId -> shared AES key

    async initialize(): Promise<ExportedPublicKeys | null> {
        // Пытаемся загрузить существующие ключи
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.keys = JSON.parse(stored);
                return this.getPublicKeys();
            } catch (e) {
                console.error('Failed to load stored keys:', e);
            }
        }
        return null;
    }

    async generateKeys(): Promise<ExportedPublicKeys> {
        // Генерируем пары ключей
        const identityKeyPair = await generateIdentityKeyPair();
        const signingKeyPair = await generateSigningKeyPair();

        // Экспортируем публичные ключи
        const identityPubBase64 = await exportKeyToBase64(identityKeyPair.publicKey);
        const signingPubBase64 = await exportKeyToBase64(signingKeyPair.publicKey);

        // Подписываем identity key
        const identityPubRaw = await crypto.subtle.exportKey('spki', identityKeyPair.publicKey);
        const signature = await sign(signingKeyPair.privateKey, identityPubRaw);
        const signatureBase64 = arrayBufferToBase64(signature);

        // Генерируем key_id
        const keyId = await generateKeyId(identityPubRaw);

        // Экспортируем приватные ключи для хранения
        const identityPrivBase64 = await exportKeyToBase64(identityKeyPair.privateKey, true);
        const signingPrivBase64 = await exportKeyToBase64(signingKeyPair.privateKey, true);

        // Сохраняем ключи
        this.keys = {
            identityKeyPair: {
                publicKey: identityPubBase64,
                privateKey: identityPrivBase64
            },
            signingKeyPair: {
                publicKey: signingPubBase64,
                privateKey: signingPrivBase64
            },
            keyId
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));

        return {
            identity_key: identityPubBase64,
            signing_key: signingPubBase64,
            signature: signatureBase64,
            key_id: keyId
        };
    }

    getPublicKeys(): ExportedPublicKeys | null {
        if (!this.keys) return null;

        // Нужно пересоздать подпись (она не хранится)
        // В production нужно хранить подпись
        return {
            identity_key: this.keys.identityKeyPair.publicKey,
            signing_key: this.keys.signingKeyPair.publicKey,
            signature: '', // TODO: store signature
            key_id: this.keys.keyId
        };
    }

    getKeyId(): string | null {
        return this.keys?.keyId || null;
    }

    hasKeys(): boolean {
        return this.keys !== null;
    }

    async deriveSessionKey(recipientPublicKeyBase64: string, recipientId: string): Promise<void> {
        if (!this.keys) {
            throw new Error('Keys not initialized');
        }

        // Проверяем кэш
        if (this.sessionKeys.has(recipientId)) {
            return;
        }

        // Импортируем наш приватный ключ
        const ourPrivateKey = await importIdentityPrivateKey(this.keys.identityKeyPair.privateKey);

        // Импортируем публичный ключ получателя
        const theirPublicKey = await importIdentityPublicKey(recipientPublicKeyBase64);

        // Вычисляем shared secret
        const sharedKey = await deriveSharedSecret(ourPrivateKey, theirPublicKey);

        this.sessionKeys.set(recipientId, sharedKey);
    }

    async encrypt(
        recipientId: string,
        plaintext: string
    ): Promise<{ ciphertext: string; nonce: string; sender_key_id: string }> {
        const key = this.sessionKeys.get(recipientId);
        if (!key) {
            throw new Error(`No session key for ${recipientId}`);
        }

        const encrypted = await encryptData(key, plaintext);

        return {
            ...encrypted,
            sender_key_id: this.keys!.keyId
        };
    }

    async decrypt(
        senderId: string,
        ciphertext: string,
        nonce: string
    ): Promise<string> {
        const key = this.sessionKeys.get(senderId);
        if (!key) {
            throw new Error(`No session key for ${senderId}`);
        }

        return decryptData(key, ciphertext, nonce);
    }

    // Очистка ключей (выход)
    clear(): void {
        this.keys = null;
        this.sessionKeys.clear();
        localStorage.removeItem(STORAGE_KEY);
    }
}

export const cryptoManager = new E2ECryptoManager();