import React, { useMemo, useState } from 'react';
import type { LocalChat, EncryptedChatKey } from '../../types';
import { cryptoManager } from '../../crypto';
import * as api from '../../api';
import { Icon } from '../../icons';

type SecurityStatus =
    | 'no_local_keys'
    | 'can_initialize'
    | 'can_update'
    | 'waiting'
    | 'peer_no_e2e'
    | 'secure';

interface Props {
    chat: LocalChat;
    currentUserId: string;
    onRefresh: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatSecurityBanner({ chat, currentUserId, onRefresh, showToast }: Props) {
    const [updating, setUpdating] = useState(false);

    const status: SecurityStatus = useMemo(() => {
        if (!cryptoManager.hasKeys()) return 'no_local_keys';

        const myMember = chat.members.find(m => m.user_id === currentUserId);
        const hasChatKey = cryptoManager.hasChatKey(chat.id);
        const anyMemberHasKey = chat.members.some(m => m.encrypted_chat_key);

        if (!anyMemberHasKey) {
            const membersWithE2E = chat.members.filter(m => m.public_keys?.identity_key);
            if (membersWithE2E.length >= 2) return 'can_initialize';
            const peersWithoutE2E = chat.members.filter(m => m.user_id !== currentUserId && !m.public_keys?.identity_key);
            if (peersWithoutE2E.length > 0) return 'peer_no_e2e';
            return 'can_initialize';
        }

        if (!hasChatKey) {
            if (myMember?.encrypted_chat_key) {
                if (myMember.member_key_id !== cryptoManager.getKeyId()) {
                    return 'waiting';
                }
            }
            return 'waiting';
        }

        for (const member of chat.members) {
            if (member.user_id === currentUserId) continue;

            if (!member.public_keys?.identity_key) {
                continue;
            }

            if (!member.encrypted_chat_key) {
                return 'can_update';
            }

            if (member.member_key_id && member.member_key_id !== member.public_keys.key_id) {
                return 'can_update';
            }
        }

        return 'secure';
    }, [chat, currentUserId]);

    const handleAction = async () => {
        setUpdating(true);
        try {
            let chatKey = cryptoManager.getChatKey(chat.id);

            if (!chatKey) {
                chatKey = await cryptoManager.generateChatKey();
            }

            const encryptedKeys: Record<string, EncryptedChatKey> = {};

            for (const member of chat.members) {
                if (!member.public_keys?.identity_key) continue;
                encryptedKeys[member.user_id] = await cryptoManager.wrapChatKey(
                    chatKey,
                    member.public_keys.identity_key,
                );
            }

            await api.updateChatKeys(chat.id, encryptedKeys);

            cryptoManager.setChatKey(chat.id, chatKey);
            await cryptoManager.saveChatKeyToCache(chat.id, chatKey);

            showToast('Ключи шифрования обновлены!', 'success');
            onRefresh();
        } catch (e: any) {
            console.error('[E2E] Update keys failed:', e);
            showToast(e.message || 'Ошибка обновления ключей', 'error');
        } finally {
            setUpdating(false);
        }
    };

    if (status === 'secure') return null;

    const isWarning = status === 'can_update' || status === 'can_initialize';
    const isError = status === 'waiting' || status === 'peer_no_e2e' || status === 'no_local_keys';

    return (
        <div className={`security-banner ${isWarning ? 'warning' : ''} ${isError ? 'error' : ''}`}>
            <div className="security-banner-content">
                {Icon.shield(16)}
                <span>
                    {status === 'no_local_keys' && 'Настройте E2E шифрование в настройках.'}
                    {status === 'can_initialize' && 'Включите шифрование для этого чата.'}
                    {status === 'can_update' && 'У собеседника обновились ключи. Обновите шифрование.'}
                    {status === 'waiting' && 'Ваши ключи обновились. Ожидайте, пока собеседник обновит доступ.'}
                    {status === 'peer_no_e2e' && 'У собеседника не настроено шифрование.'}
                </span>
            </div>

            {(status === 'can_initialize' || status === 'can_update') && (
                <button
                    className="security-banner-btn"
                    onClick={handleAction}
                    disabled={updating}
                >
                    {updating ? 'Обновление...' : status === 'can_initialize' ? 'Включить' : 'Обновить'}
                </button>
            )}
        </div>
    );
}