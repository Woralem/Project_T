import React from 'react';
import { X, Users } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Avatar } from './Avatar';

export function NotificationToasts() {
    const notifications = useUiStore(s => s.notifications);
    const removeNotification = useUiStore(s => s.removeNotification);
    const setActiveTab = useUiStore(s => s.setActiveTab);
    const selectChat = useChatStore(s => s.selectChat);
    const user = useAuthStore(s => s.user);

    if (!notifications.length) return null;

    const handleClick = (chatId: string, notifId: string) => {
        removeNotification(notifId);
        if (user) {
            selectChat(chatId, user.id);
            setActiveTab('chats');
        }
        window.focus();
    };

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 380 }}>
            {notifications.map(n => (
                <div
                    key={n.id}
                    className="pointer-events-auto flex items-start gap-3 p-3 pr-2 bg-white dark:bg-[#1e1e2a] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-[#252536] transition-all animate-in slide-in-from-right-5 fade-in duration-300"
                    onClick={() => handleClick(n.chatId, n.id)}
                >
                    <Avatar name={n.isGroup ? n.chatName : n.senderName} size={44} avatarUrl={n.senderAvatarUrl} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            {n.isGroup && <Users size={12} className="text-gray-400 flex-shrink-0" />}
                            <span className="text-[13px] font-bold truncate">{n.isGroup ? n.chatName : n.senderName}</span>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">сейчас</span>
                        </div>
                        <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate mt-0.5">
                            {n.isGroup && <span className="font-medium text-gray-700 dark:text-gray-300">{n.senderName}: </span>}
                            {n.text}
                        </p>
                    </div>
                    <button
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg transition flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}