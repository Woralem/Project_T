import React, { useState } from 'react';
import { X, Search, Users, Share2 } from 'lucide-react';
import type { LocalChat, LocalMessage } from '../../types';
import { Avatar } from '../ui/Avatar';

interface Props {
    open: boolean;
    message: LocalMessage | null;
    chats: LocalChat[];
    currentUserId: string;
    onForward: (msg: LocalMessage, targetChatId: string) => void;
    onClose: () => void;
}

export function ForwardModal({ open, message, chats, currentUserId, onForward, onClose }: Props) {
    const [search, setSearch] = useState('');

    if (!open || !message) return null;

    const filtered = chats.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const getChatAvatar = (chat: LocalChat): string | undefined => {
        if (chat.is_group) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    const handleSelect = (chatId: string) => {
        onForward(message, chatId);
        onClose();
    };

    const previewText = message.attachment
        ? `📎 ${message.attachment.filename}`
        : (message.decrypted_content || message.content).length > 60
            ? (message.decrypted_content || message.content).slice(0, 60) + '…'
            : (message.decrypted_content || message.content);

    return (
        <>
            <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" onMouseDown={onClose} />
            <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4 pointer-events-none">
                <div className="w-full max-w-[460px] bg-white dark:bg-[#18181f] border border-gray-200 dark:border-white/5 rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[85vh]" onMouseDown={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                        <h3 className="text-lg font-bold flex items-center gap-2"><Share2 size={20} /> Переслать</h3>
                        <button className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition" onClick={onClose}><X size={24} /></button>
                    </div>

                    <div className="p-4 flex flex-col flex-1 overflow-hidden">
                        {/* Preview */}
                        <div className="flex gap-2 mb-4 p-3 bg-gray-50 dark:bg-[#1a1a24] rounded-xl border border-gray-200 dark:border-white/5">
                            <div className="w-0.5 bg-accent rounded-full flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-bold text-accent">{message.sender_name}</div>
                                <div className="text-[13px] text-gray-500 truncate">{previewText}</div>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative mb-3 flex-shrink-0">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Поиск чата..."
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#16161e] border border-transparent focus:border-accent rounded-xl text-[13px] outline-none transition"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Chat list */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
                            {filtered.map(chat => (
                                <button
                                    key={chat.id}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-[#20202c] transition text-left"
                                    onClick={() => handleSelect(chat.id)}
                                >
                                    <Avatar name={chat.name} size={42} online={chat.is_group ? undefined : chat.online} avatarUrl={getChatAvatar(chat)} />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                                            {chat.is_group && <Users size={13} className="text-gray-400" />}
                                            {chat.name}
                                        </span>
                                    </div>
                                </button>
                            ))}
                            {filtered.length === 0 && <p className="text-center text-gray-400 text-[13px] py-4">Чаты не найдены</p>}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}