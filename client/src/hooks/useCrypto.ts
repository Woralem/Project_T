// client/src/hooks/useCrypto.ts

import { useState, useCallback, useEffect } from 'react';
import { cryptoManager, ExportedPublicKeys } from '../crypto';
import type { ChatMemberDto, EncryptedPayload } from '../types';

export function useCrypto() {
    const [ready, setReady] = useState(false);
    const [publicKeys, setPublicKeys] = useState<ExportedPublicKeys | null>(null);

    // Инициализация при монтировании
    useEffect(() => {
        cryptoManager.initialize().then(keys => {
            setPublicKeys(keys);
            setReady(true);
        });
    }, []);

    // Генерация новых ключей
    const generateKeys = useCallback(async () => {
        const keys = await cryptoManager.generateKeys();
        setPublicKeys(keys);
        return keys;
    }, []);

    // Установка сессионных ключей для участников чата
    const setupChatEncryption = useCallback(async (members: ChatMemberDto[], myUserId: string) => {
        for (const member of members) {
            if (member.user_id === myUserId) continue;
            if (!member.public_keys?.identity_key) continue;

            try {
                await cryptoManager.deriveSessionKey(
                    member.public_keys.identity_key,
                    member.user_id
                );
            } catch (e) {
                console.warn(`Failed to derive key for ${member.user_id}:`, e);
            }
        }
    }, []);

    // Шифрование сообщения для получателя
    const encryptMessage = useCallback(async (
        recipientId: string,
        plaintext: string
    ): Promise<EncryptedPayload | null> => {
        if (!cryptoManager.hasKeys()) return null;

        try {
            return await cryptoManager.encrypt(recipientId, plaintext);
        } catch (e) {
            console.warn('Encryption failed:', e);
            return null;
        }
    }, []);

    // Расшифровка сообщения
    const decryptMessage = useCallback(async (
        senderId: string,
        encrypted: EncryptedPayload
    ): Promise<string | null> => {
        if (!cryptoManager.hasKeys()) return null;

        try {
            return await cryptoManager.decrypt(senderId, encrypted.ciphertext, encrypted.nonce);
        } catch (e) {
            console.warn('Decryption failed:', e);
            return null;
        }
    }, []);

    // Проверка, включено ли E2E для чата
    const isChatEncrypted = useCallback((members: ChatMemberDto[], myUserId: string): boolean => {
        if (!cryptoManager.hasKeys()) return false;

        // Все участники должны иметь ключи
        return members.every(m =>
            m.user_id === myUserId || m.public_keys?.identity_key
        );
    }, []);

    // Очистка при выходе
    const clear = useCallback(() => {
        cryptoManager.clear();
        setPublicKeys(null);
        setReady(false);
    }, []);

    return {
        ready,
        hasKeys: cryptoManager.hasKeys(),
        publicKeys,
        generateKeys,
        setupChatEncryption,
        encryptMessage,
        decryptMessage,
        isChatEncrypted,
        clear
    };
}