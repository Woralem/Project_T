import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Shield, Lock, Check, Copy, Plus, Sun, Moon, Camera, Trash2, Bell } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import * as api from '../../api';
import { SERVER_URL } from '../../api';
import type { UserDto, AvatarHistoryDto } from '../../types';
import { cryptoManager } from '../../crypto';

interface Props {
    darkMode: boolean;
    onToggleTheme: () => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
    user: UserDto | null;
    onUserUpdate?: (user: UserDto) => void;
}

export function SettingsView({ darkMode, onToggleTheme, showToast, user, onUserUpdate }: Props) {
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [settingUpE2E, setSettingUpE2E] = useState(false);
    const [e2eEnabled, setE2eEnabled] = useState(() => cryptoManager.hasKeys());
    const [bio, setBio] = useState(user?.bio || '');
    const [bioChanged, setBioChanged] = useState(false);
    const [savingBio, setSavingBio] = useState(false);
    const [avatarHistory, setAvatarHistory] = useState<AvatarHistoryDto[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchProfile = useCallback(async () => {
        if (!user) return;
        try {
            const p = await api.getUserProfile(user.id);
            setAvatarHistory(p.avatars);
            setBio(p.bio); setBioChanged(false);
        } catch { /* ignore */ }
    }, [user?.id]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    const handleSaveBio = async () => {
        if (!bioChanged) return;
        setSavingBio(true);
        try { const u = await api.updateProfile({ bio }); setBioChanged(false); showToast('Био обновлено', 'success'); onUserUpdate?.(u); }
        catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setSavingBio(false); }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Выберите изображение', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast('Макс 5МБ', 'error'); return; }
        setUploadingAvatar(true);
        try {
            const r = await api.uploadAvatar(file);
            showToast('Аватарка обновлена!', 'success');
            if (user && onUserUpdate) onUserUpdate({ ...user, avatar_url: r.avatar_url });
            await fetchProfile();
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setUploadingAvatar(false); if (fileRef.current) fileRef.current.value = ''; }
    };

    const handleDeleteAvatar = async () => {
        if (!user?.avatar_url) return;
        try { await api.deleteAvatar(); showToast('Аватарка снята', 'success'); if (user && onUserUpdate) onUserUpdate({ ...user, avatar_url: undefined }); await fetchProfile(); }
        catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const handleSetupE2E = async () => {
        setSettingUpE2E(true);
        try {
            const pk = await cryptoManager.generateKeys();
            const u = await api.updateProfile({ public_keys: pk });
            setE2eEnabled(true); showToast('E2E настроено!', 'success');
            onUserUpdate?.(u);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setSettingUpE2E(false); }
    };

    const handleCreateInvite = async () => {
        setCreatingInvite(true);
        try { const inv = await api.createInvite(48); setInviteCode(inv.code); showToast('Код создан!', 'success'); }
        catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
        finally { setCreatingInvite(false); }
    };

    const keyId = cryptoManager.getKeyId();

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="max-w-xl mx-auto px-6 py-8 space-y-6">
                <h2 className="text-2xl font-bold">Настройки</h2>

                {/* Профиль */}
                <Section title="Профиль">
                    <div className="flex items-center gap-4">
                        <div className="relative cursor-pointer group" onClick={() => fileRef.current?.click()}>
                            <Avatar name={user?.display_name || 'User'} size={72} avatarUrl={user?.avatar_url} />
                            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Camera size={24} className="text-white" />
                            </div>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                        <div className="flex flex-col">
                            <strong className="text-[16px]">{user?.display_name}</strong>
                            <span className="text-[13px] text-gray-500">@{user?.username}</span>
                            {user?.avatar_url && <button className="text-[12px] text-red-500 hover:underline mt-1 text-left" onClick={handleDeleteAvatar}>Снять аватарку</button>}
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="text-[12px] font-semibold text-gray-500 mb-1 block">О себе</label>
                        <textarea className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-[#1a1a24] border border-gray-200 dark:border-white/5 outline-none focus:border-accent text-[14px] resize-none transition" rows={3} maxLength={200} value={bio} onChange={e => { setBio(e.target.value); setBioChanged(true); }} placeholder="Расскажите о себе..." />
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-[11px] text-gray-400">{bio.length}/200</span>
                            {bioChanged && <button className="text-[12px] font-bold text-accent hover:underline" onClick={handleSaveBio} disabled={savingBio}>{savingBio ? 'Сохранение...' : 'Сохранить'}</button>}
                        </div>
                    </div>
                </Section>

                {/* E2E */}
                <Section title="Сквозное шифрование">
                    {e2eEnabled ? (
                        <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded-xl">
                            <Shield size={20} className="text-green-500 mt-0.5" />
                            <div>
                                <div className="text-[14px] font-semibold text-green-600 dark:text-green-400">Включено</div>
                                {keyId && <code className="text-[11px] text-gray-500 mt-1 block">{keyId}</code>}
                                <button className="text-[12px] text-gray-500 hover:text-gray-900 dark:hover:text-white mt-2 hover:underline" onClick={handleSetupE2E}>Пересоздать ключи</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 p-6 bg-gray-50 dark:bg-[#1a1a24] rounded-xl text-center">
                            <Lock size={32} className="text-gray-400" />
                            <div className="text-[14px] font-medium">Шифрование не настроено</div>
                            <div className="text-[12px] text-gray-500">ECIES + AES-256-GCM для каждого чата</div>
                            <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-[13px] font-bold rounded-xl transition active:scale-95 disabled:opacity-50" onClick={handleSetupE2E} disabled={settingUpE2E}>
                                {settingUpE2E ? 'Генерация...' : 'Настроить E2E'}
                            </button>
                        </div>
                    )}
                </Section>

                {/* Инвайты */}
                <Section title="Пригласить друга">
                    {inviteCode ? (
                        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-[#1a1a24] rounded-xl border border-gray-200 dark:border-white/5">
                            <code className="flex-1 font-mono text-[14px] font-bold text-accent">{inviteCode}</code>
                            <button className="p-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition active:scale-95" onClick={() => { navigator.clipboard.writeText(inviteCode); showToast('Скопировано', 'success'); }}><Copy size={16} /></button>
                        </div>
                    ) : (
                        <button className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 dark:bg-[#1a1a24] dark:hover:bg-[#20202c] rounded-xl transition text-[14px] font-medium border border-gray-200 dark:border-white/5 active:scale-[0.98]" onClick={handleCreateInvite} disabled={creatingInvite}>
                            <Plus size={18} className="text-accent" /> {creatingInvite ? 'Создание...' : 'Создать инвайт-код'}
                        </button>
                    )}
                </Section>

                {/* Тема */}
                <Section title="Внешний вид">
                    <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 dark:bg-[#1a1a24] dark:hover:bg-[#20202c] rounded-xl transition active:scale-[0.98]" onClick={onToggleTheme}>
                        <span className="flex items-center gap-2 text-[14px] font-medium">{darkMode ? <Moon size={18} /> : <Sun size={18} />} Тёмная тема</span>
                        <div className={`w-10 h-6 rounded-full p-0.5 transition ${darkMode ? 'bg-accent' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-4' : ''}`} />
                        </div>
                    </button>
                </Section>

                {/* Версия */}
                <Section title="О приложении">
                    <div className="px-4 py-3 flex justify-between text-[14px]">
                        <span className="text-gray-500">Версия</span>
                        <span className="font-medium">0.5.0</span>
                    </div>
                </Section>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-[#15151c] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-[13px] font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}