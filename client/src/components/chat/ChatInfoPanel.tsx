import React, { useState, useRef } from 'react';
import { X, LogOut, Trash2, Link2, Copy, Users, Camera, UserMinus } from 'lucide-react';
import type { LocalChat } from '../../types';
import { Avatar } from '../ui/Avatar';
import { UserProfilePanel } from './UserProfilePanel';
import { useUiStore } from '../../store/useUiStore';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import * as api from '../../api';

interface Props { chat: LocalChat; currentUserId: string; onClose: () => void }

export function ChatInfoPanel({ chat, currentUserId, onClose }: Props) {
    const showToast = useUiStore(s => s.showToast);
    const loadChats = useChatStore(s => s.loadChats);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedMember, setSelectedMember] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const myRole = chat.members.find(m => m.user_id === currentUserId)?.role || 'member';
    const isAdmin = myRole === 'owner' || myRole === 'admin';

    const handleCreateInvite = async () => {
        setLoading(true);
        try { const inv = await api.createChatInvite(chat.id, 168); setInviteCode(inv.code); showToast('Ссылка создана!', 'success'); }
        catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setLoading(false); }
    };

    const handleLeave = async () => {
        if (!confirm('Вы уверены, что хотите покинуть чат?')) return;
        try {
            await api.leaveChat(chat.id);
            showToast('Вы покинули чат', 'success');
            useChatStore.getState().selectChat(null, currentUserId);
            loadChats(currentUserId);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const handleDelete = async () => {
        if (!confirm('Удалить чат для всех участников?')) return;
        try {
            await api.deleteChat(chat.id);
            showToast('Чат удалён', 'success');
            useChatStore.getState().selectChat(null, currentUserId);
            loadChats(currentUserId);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const handleKick = async (userId: string, displayName: string) => {
        if (!confirm(`Удалить ${displayName} из чата?`)) return;
        try {
            const res = await fetch(`${api.SERVER_URL}/api/chats/${chat.id}/kick/${userId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'Ошибка'); }
            showToast(`${displayName} удалён`, 'success');
            loadChats(currentUserId);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    // ★ ИСПРАВЛЕНО — обновляет avatar_url в сторе без перезагрузки всех чатов
    const handleUploadGroupAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Выберите изображение', 'error'); return; }
        try {
            const formData = new FormData(); formData.append('avatar', file);
            const headers: Record<string, string> = {};
            if (api.getToken()) headers['Authorization'] = `Bearer ${api.getToken()}`;
            const res = await fetch(`${api.SERVER_URL}/api/chats/${chat.id}/avatar`, { method: 'POST', headers, body: formData });
            if (!res.ok) throw new Error('Ошибка загрузки');
            const data = await res.json();
            showToast('Аватарка обновлена!', 'success');
            // ★ Обновляем только avatar_url этого чата в сторе
            useChatStore.setState(s => ({
                chats: s.chats.map(c => c.id === chat.id ? { ...c, avatar_url: data.avatar_url } : c)
            }));
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { if (fileRef.current) fileRef.current.value = ''; }
    };

    const member = selectedMember ? chat.members.find(m => m.user_id === selectedMember) : null;

    if (member) {
        return <UserProfilePanel member={member} onClose={() => setSelectedMember(null)} />;
    }

    return (
        <aside className="w-[320px] h-full flex flex-col bg-white dark:bg-[#15151c] shadow-2xl animate-in slide-in-from-right-8 duration-300">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <h3 className="font-bold text-[16px]">Информация</h3>
                <button className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition" onClick={onClose}><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="flex flex-col items-center gap-2 px-4 pt-6 pb-4">
                    {/* ★ Показываем аватарку чата */}
                    <div className="relative group cursor-pointer" onClick={() => isAdmin && fileRef.current?.click()}>
                        <Avatar name={chat.name} size={80} avatarUrl={chat.avatar_url} />
                        {isAdmin && (
                            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Camera size={24} className="text-white" />
                            </div>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadGroupAvatar} />
                    <h3 className="text-[17px] font-bold mt-2">{chat.isChannel ? '📢 ' : ''}{chat.name}</h3>
                    <span className="text-[13px] text-gray-500">{chat.members.length} {chat.isChannel ? 'подписчиков' : 'участников'}</span>
                </div>

                {isAdmin && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Приглашение</div>
                        {inviteCode ? (
                            <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-[#1a1a24] rounded-xl border border-gray-200 dark:border-white/5">
                                <code className="flex-1 font-mono text-[13px] font-bold text-accent truncate pl-2">{inviteCode}</code>
                                <button className="p-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition" onClick={() => { navigator.clipboard.writeText(inviteCode); showToast('Скопировано', 'success'); }}><Copy size={14} /></button>
                            </div>
                        ) : (
                            <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 dark:bg-[#1a1a24] dark:hover:bg-[#20202c] text-[13px] font-medium rounded-xl transition border border-gray-200 dark:border-white/5" onClick={handleCreateInvite} disabled={loading}>
                                <Link2 size={16} className="text-accent" /> {loading ? 'Создание...' : 'Создать ссылку'}
                            </button>
                        )}
                    </div>
                )}

                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users size={14} /> Участники ({chat.members.length})</div>
                    <div className="flex flex-col gap-1 mt-3">
                        {chat.members.map(m => (
                            <div
                                key={m.user_id}
                                className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-[#20202c] transition cursor-pointer group"
                                onClick={() => setSelectedMember(m.user_id)}
                            >
                                <Avatar name={m.display_name} size={36} online={m.online} avatarUrl={m.avatar_url} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-[14px] font-medium truncate">{m.display_name}{m.user_id === currentUserId ? ' (вы)' : ''}</div>
                                    <div className="text-[11px] text-gray-500">{m.role === 'owner' ? 'Создатель' : m.role === 'admin' ? 'Админ' : 'Участник'}</div>
                                </div>
                                {isAdmin && m.user_id !== currentUserId && m.role !== 'owner' && (
                                    <button
                                        className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition rounded-lg hover:bg-red-500/10"
                                        onClick={(e) => { e.stopPropagation(); handleKick(m.user_id, m.display_name); }}
                                        title="Удалить из чата"
                                    >
                                        <UserMinus size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-2 mt-4">
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition" onClick={handleLeave}><LogOut size={18} /> Покинуть чат</button>
                    {myRole === 'owner' && <button className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-red-500 hover:bg-red-500/10 rounded-xl transition" onClick={handleDelete}><Trash2 size={18} /> Удалить для всех</button>}
                </div>
            </div>
        </aside>
    );
}