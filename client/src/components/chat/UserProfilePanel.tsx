import React, { useState, useEffect } from 'react';
import { X, Phone, Shield, AtSign, Clock, User } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import type { ChatMemberDto, UserProfileDto } from '../../types';
import * as api from '../../api';
import { formatDate } from '../../utils';

interface Props {
    member: ChatMemberDto;
    onClose: () => void;
}

export function UserProfilePanel({ member, onClose }: Props) {
    const [profile, setProfile] = useState<UserProfileDto | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.getUserProfile(member.user_id)
            .then(setProfile)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [member.user_id]);

    return (
        <aside className="w-[320px] h-full flex flex-col bg-white dark:bg-[#15151c] shadow-2xl animate-in slide-in-from-right-8 duration-300">
            {/* Шапка */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <h3 className="font-bold text-[16px]">Профиль</h3>
                <button className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition" onClick={onClose}>
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-400 text-[13px]">Загрузка...</div>
                ) : (
                    <>
                        {/* Аватар и имя */}
                        <div className="flex flex-col items-center gap-3 px-4 pt-8 pb-6">
                            <Avatar
                                name={member.display_name}
                                size={100}
                                online={member.online}
                                avatarUrl={member.avatar_url}
                            />
                            <div className="text-center mt-1">
                                <h3 className="text-[20px] font-bold">{member.display_name}</h3>
                                <span className="text-[13px] text-gray-500">@{member.username}</span>
                            </div>
                            <span className={`text-[12px] font-medium px-3 py-1 rounded-full ${member.online
                                ? 'bg-green-500/10 text-green-500'
                                : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                                }`}>
                                {member.online ? '● в сети' : '○ был(а) недавно'}
                            </span>
                        </div>

                        {/* Информация */}
                        <div className="px-4 space-y-1">
                            {/* Био */}
                            {profile?.bio && (
                                <InfoRow
                                    icon={<User size={16} />}
                                    label="О себе"
                                    value={profile.bio}
                                />
                            )}

                            {/* Юзернейм */}
                            <InfoRow
                                icon={<AtSign size={16} />}
                                label="Имя пользователя"
                                value={`@${member.username}`}
                            />

                            {/* E2E */}
                            {member.public_keys && (
                                <InfoRow
                                    icon={<Shield size={16} />}
                                    label="Шифрование"
                                    value={
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 bg-green-500 rounded-full" />
                                            E2E включено
                                            <code className="text-[10px] text-gray-400 ml-1">
                                                {member.public_keys.key_id.slice(0, 12)}…
                                            </code>
                                        </span>
                                    }
                                />
                            )}

                            {/* Дата регистрации */}
                            {profile?.created_at && (
                                <InfoRow
                                    icon={<Clock size={16} />}
                                    label="В мессенджере с"
                                    value={formatDate(profile.created_at)}
                                />
                            )}
                        </div>

                        {/* Аватарки */}
                        {profile && profile.avatars.length > 1 && (
                            <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800 mt-4">
                                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    Фотографии ({profile.avatars.length})
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {profile.avatars.map(a => (
                                        <div
                                            key={a.id}
                                            className={`aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition ring-2 ${a.is_current ? 'ring-accent' : 'ring-transparent'}`}
                                        >
                                            <img
                                                src={a.url.startsWith('http') ? a.url : `${api.SERVER_URL}${a.url}`}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Действия */}
                        <div className="p-4 border-t border-gray-200 dark:border-gray-800 mt-4 flex flex-col gap-2">
                            <button className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-xl transition">
                                <Phone size={18} /> Позвонить
                            </button>
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}

/* Строка информации */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-[#1a1a24] transition">
            <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
            <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{label}</span>
                <span className="text-[14px] font-medium mt-0.5 break-words">{typeof value === 'string' ? value : value}</span>
            </div>
        </div>
    );
}