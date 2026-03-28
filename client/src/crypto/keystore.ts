const DB_NAME = 'e2e_keystore';
const DB_VERSION = 2;

const STORES = {
    SESSION_KEYS: 'session_keys',
    DECRYPTED_MSGS: 'decrypted_msgs',
    PEER_KEY_HISTORY: 'peer_key_history',
    VOICE_CACHE: 'voice_cache',
};

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const name of Object.values(STORES)) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name);
                }
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function put(store: string, key: string, value: any): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function get<T>(store: string, key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function del(store: string, key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function clearStore(store: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export const keystore = {
    async saveDecryptedMessage(messageId: string, plaintext: string): Promise<void> {
        try { await put(STORES.DECRYPTED_MSGS, messageId, plaintext); }
        catch (e) { console.warn('[KS] saveDecryptedMessage failed:', e); }
    },

    async getDecryptedMessage(messageId: string): Promise<string | undefined> {
        try { return await get<string>(STORES.DECRYPTED_MSGS, messageId); }
        catch (e) { return undefined; }
    },

    async saveSessionKey(chatId: string, exportedKey: ArrayBuffer, ownerKeyId: string): Promise<void> {
        try {
            await put(STORES.SESSION_KEYS, chatId, {
                key: Array.from(new Uint8Array(exportedKey)),
                peerPublicKey: ownerKeyId,
                timestamp: Date.now(),
            });
        } catch (e) { console.warn('[KS] saveSessionKey failed:', e); }
    },

    async getSessionKey(chatId: string): Promise<{ key: number[]; peerPublicKey: string } | undefined> {
        try { return await get(STORES.SESSION_KEYS, chatId); }
        catch (e) { return undefined; }
    },

    async deleteSessionKey(chatId: string): Promise<void> {
        try { await del(STORES.SESSION_KEYS, chatId); }
        catch (e) { console.warn('[KS] deleteSessionKey failed:', e); }
    },

    async clearSessionKeys(): Promise<void> {
        try { await clearStore(STORES.SESSION_KEYS); }
        catch (e) { console.warn('[KS] clearSessionKeys failed:', e); }
    },

    async savePeerKey(peerId: string, keyId: string, identityKey: string): Promise<void> {
        try { await put(STORES.PEER_KEY_HISTORY, `${peerId}:${keyId}`, identityKey); }
        catch (e) { console.warn('[KS] savePeerKey failed:', e); }
    },

    async getPeerKey(peerId: string, keyId: string): Promise<string | undefined> {
        try { return await get<string>(STORES.PEER_KEY_HISTORY, `${peerId}:${keyId}`); }
        catch (e) { return undefined; }
    },

    async saveVoiceCache(attachmentId: string, data: ArrayBuffer): Promise<void> {
        try { await put(STORES.VOICE_CACHE, attachmentId, Array.from(new Uint8Array(data))); }
        catch (e) { console.warn('[KS] saveVoiceCache failed:', e); }
    },

    async getVoiceCache(attachmentId: string): Promise<ArrayBuffer | undefined> {
        try {
            const arr = await get<number[]>(STORES.VOICE_CACHE, attachmentId);
            return arr ? new Uint8Array(arr).buffer : undefined;
        } catch (e) { return undefined; }
    },

    async clearAll(): Promise<void> {
        try {
            for (const store of Object.values(STORES)) {
                await clearStore(store);
            }
        } catch (e) { console.warn('[KS] clearAll failed:', e); }
    },
};