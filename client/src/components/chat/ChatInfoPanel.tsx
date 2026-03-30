import React, { useMemo, useState, useEffect } from 'react';
import type { LocalChat, ChatInviteDto } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../../icons';
import * as api from '../../api';

interface Props {
    chat: LocalChat;
    currentUserId: string;
    onClose: () => void;
    onOpenProfile: (userId: string) => void;
    onLeaveChat: () => void;
    onDeleteChat: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatInfoPanel({ chat, currentUserId, onClose, onOpenProfile, onLeaveChat, onDeleteChat, showToast }: Props) {
    const myRole = useMemo(() => chat.members.find(m => m.user_id === currentUserId)?.role || 'member', [chat, currentUserId]);
    const canDelete = myRole === 'owner';
    const canInvite = myRole === 'owner' || myRole === 'admin';
    const avatarUrl = chat.is_group ? undefined : chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;

    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [creatingInvite, setCreatingInvite] = useState(false);

    const sharedImages = useMemo(() => {
        return chat.messages.filter(m => m.attachment && m.attachment.mime_type.startsWith('image/')).slice(-12).reverse();
    }, [chat.messages]);

    const handleCreateInvite = async () => {
        setCreatingInvite(true);
        try {
            const inv = await api.createChatInvite(chat.id, 168); // 7 дней
            setInviteCode(inv.code);
            showToast('Ссылка создана!', 'success');
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setCreatingInvite(false); }
    };

    const copyInvite = () => {
        if (inviteCode) { navigator.clipboard.writeText(inviteCode); showToast('Код скопирован', 'success'); }
    };

    return (
        <aside className="chat-info-panel">
            <div className="cip-header">
                <h3>Информация</h3>
                <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
            </div>

            <div className="cip-avatar-section">
                <Avatar name={chat.name} size={80} avatarUrl={avatarUrl} />
                <h3 className="cip-name">{chat.isChannel ? '📢 ' : ''}{chat.name}</h3>
                <span className="cip-sub">
                    {chat.isChannel ? `${chat.members.length} подписчиков` : `${chat.members.length} участников`}
                </span>
            </div>

            {/* Ссылка-приглашение */}
            {canInvite && (
                <div className="cip-section">
                    <div className="cip-section-label">Пригласительная ссылка</div>
                    {inviteCode ? (
                        <div className="cip-invite-result">
                            <code className="cip-invite-code">{inviteCode}</code>
                            <button className="cip-invite-copy" onClick={copyInvite}>{Icon.copy(14)} Копировать</button>
                        </div>
                    ) : (
                        <button className="cip-action-btn" onClick={handleCreateInvite} disabled={creatingInvite}>
                            {Icon.plus(16)} {creatingInvite ? 'Создание...' : 'Создать ссылку'}
                        </button>
                    )}
                </div>
            )}

            {/* Участники */}
            <div className="cip-section">
                <div className="cip-section-label">Участники ({chat.members.length})</div>
                <div className="cip-member-list">
                    {chat.members.map(m => (
                        <button key={m.user_id} className="cip-member" onClick={() => onOpenProfile(m.user_id)}>
                            <Avatar name={m.display_name} size={36} online={m.online} avatarUrl={m.avatar_url} />
                            <div className="cip-member-info">
                                <span className="cip-member-name">{m.display_name}{m.user_id === currentUserId ? ' (вы)' : ''}</span>
                                <span className="cip-member-role">{m.role === 'owner' ? 'Создатель' : m.role === 'admin' ? 'Админ' : chat.isChannel ? 'Подписчик' : 'Участник'}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {sharedImages.length > 0 && (
                <div className="cip-section">
                    <div className="cip-section-label">Медиа ({sharedImages.length})</div>
                    <div className="cip-media-grid">
                        {sharedImages.map(m => (
                            <div key={m.id} className="cip-media-thumb">
                                <img src={api.getFileUrl(m.attachment!.id)} alt="" />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="cip-section cip-actions">
                <button className="cip-action-btn danger" onClick={onLeaveChat}>{Icon.leave(18)} Покинуть</button>
                {canDelete && <button className="cip-action-btn danger" onClick={onDeleteChat}>{Icon.trash(18)} Удалить</button>}
            </div>
        </aside>
    );
}