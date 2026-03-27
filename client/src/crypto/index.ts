const STORAGE_KEY = 'e2e_keys';
const ALGORITHM = 'AES-GCM';

export interface StoredKeys {
    identityKeyPair: {
        publicKey: string;
        privateKey: string;
    };
    signingKeyPair: {
        publicKey: string;
        privateKey: string;
    };
    signature: string;
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
//  Менеджер ключей
// ═══════════════════════════════════════════════════════════

class E2ECryptoManager {
    private keys: StoredKeys | null = null;
    private sessionKeys: Map<string, CryptoKey> = new Map();

    async initialize(): Promise<ExportedPublicKeys | null> {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.keys = JSON.parse(stored);
                return this.getPublicKeys();
            } catch (e) {
                console.error('[E2E] Failed to load stored keys:', e);
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        return null;
    }

    async generateKeys(): Promise<ExportedPublicKeys> {
        // Генерация ECDH ключей для обмена
        const identityKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits']
        );

        // Генерация ECDSA ключей для подписей
        const signingKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign', 'verify']
        );

        // Экспорт публичных ключей
        const identityPubExported = await crypto.subtle.exportKey('spki', identityKeyPair.publicKey);
        const signingPubExported = await crypto.subtle.exportKey('spki', signingKeyPair.publicKey);
        const identityPubBase64 = arrayBufferToBase64(identityPubExported);
        const signingPubBase64 = arrayBufferToBase64(signingPubExported);

        // Подписываем identity key
        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            signingKeyPair.privateKey,
            identityPubExported
        );
        const signatureBase64 = arrayBufferToBase64(signature);

        // Key ID
        const keyId = await generateKeyId(identityPubExported);

        // Экспорт приватных ключей
        const identityPrivExported = await crypto.subtle.exportKey('pkcs8', identityKeyPair.privateKey);
        const signingPrivExported = await crypto.subtle.exportKey('pkcs8', signingKeyPair.privateKey);

        // Сохраняем
        this.keys = {
            identityKeyPair: {
                publicKey: identityPubBase64,
                privateKey: arrayBufferToBase64(identityPrivExported),
            },
            signingKeyPair: {
                publicKey: signingPubBase64,
                privateKey: arrayBufferToBase64(signingPrivExported),
            },
            signature: signatureBase64,
            keyId,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));
        console.log('[E2E] Keys generated, keyId:', keyId);

        return {
            identity_key: identityPubBase64,
            signing_key: signingPubBase64,
            signature: signatureBase64,
            key_id: keyId,
        };
    }

    getPublicKeys(): ExportedPublicKeys | null {
        if (!this.keys) return null;
        return {
            identity_key: this.keys.identityKeyPair.publicKey,
            signing_key: this.keys.signingKeyPair.publicKey,
            signature: this.keys.signature,
            key_id: this.keys.keyId,
        };
    }

    getKeyId(): string | null {
        return this.keys?.keyId || null;
    }

    hasKeys(): boolean {
        return this.keys !== null;
    }

    async deriveSessionKey(recipientPublicKeyBase64: string, recipientId: string): Promise<void> {
        if (!this.keys) throw new Error('Keys not initialized');
        if (this.sessionKeys.has(recipientId)) return;

        try {
            const ourPrivateKey = await crypto.subtle.importKey(
                'pkcs8',
                base64ToArrayBuffer(this.keys.identityKeyPair.privateKey),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                ['deriveBits']
            );

            const theirPublicKey = await crypto.subtle.importKey(
                'spki',
                base64ToArrayBuffer(recipientPublicKeyBase64),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            );

            const sharedBits = await crypto.subtle.deriveBits(
                { name: 'ECDH', public: theirPublicKey },
                ourPrivateKey,
                256
            );

            const hkdfKey = await crypto.subtle.importKey(
                'raw', sharedBits, { name: 'HKDF' }, false, ['deriveKey']
            );

            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'HKDF',
                    hash: 'SHA-256',
                    salt: new Uint8Array(32),
                    info: new TextEncoder().encode('e2e-messenger'),
                },
                hkdfKey,
                { name: ALGORITHM, length: 256 },
                false,
                ['encrypt', 'decrypt']
            );

            this.sessionKeys.set(recipientId, aesKey);
            console.log('[E2E] Session key derived for', recipientId);
        } catch (e) {
            console.error('[E2E] deriveSessionKey failed:', e);
            throw e;
        }
    }

    async encrypt(
        recipientId: string,
        plaintext: string,
    ): Promise<{ ciphertext: string; nonce: string; sender_key_id: string }> {
        const key = this.sessionKeys.get(recipientId);
        if (!key) throw new Error(`No session key for ${recipientId}`);

        const data = new TextEncoder().encode(plaintext);
        const nonce = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: ALGORITHM, iv: nonce },
            key,
            data
        );

        return {
            ciphertext: arrayBufferToBase64(encrypted),
            nonce: arrayBufferToBase64(nonce.buffer),
            sender_key_id: this.keys!.keyId,
        };
    }

    async decrypt(senderId: string, ciphertext: string, nonce: string): Promise<string> {
        const key = this.sessionKeys.get(senderId);
        if (!key) throw new Error(`No session key for ${senderId}`);

        const nonceBuffer = base64ToArrayBuffer(nonce);

        const decrypted = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: nonceBuffer },
            key,
            base64ToArrayBuffer(ciphertext)
        );

        return new TextDecoder().decode(decrypted);
    }

    clear(): void {
        this.keys = null;
        this.sessionKeys.clear();
        localStorage.removeItem(STORAGE_KEY);
        console.log('[E2E] Keys cleared');
    }
}

export const cryptoManager = new E2ECryptoManager();