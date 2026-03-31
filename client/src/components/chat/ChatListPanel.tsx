import React, { useMemo, useState } from 'react';
import { Search, Plus, Users, Pin, Megaphone, Link2 } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { NewChatModal } from './NewChatModal';
import { useChatStore } from '../../store/useChatStore';
import { useUiStore } from '../../store/useUiStore';
import * as api from '../../api';

interface Props { currentUserId: string }

export function ChatListPanel({ currentUserId }: Props) {
    const { chats, selectedId, selectChat, search, setSearch, loading, loadChats } = useChatStore();
    const showToast = useUiStore(s => s.showToast);
    const [newChatOpen, setNewChatOpen] = useState(false);

    const sorted = useMemo(() => {
        const f = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
        return f.sort((a, b) => (a.isPinned === b.isPinned ? (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '') : a.isPinned ? -1 : 1));
    }, [chats, search]);

    const getChatAvatar = (chat: any) => {
        if (chat.is_group || chat.isChannel) return chat.avatar_url;
        return chat.members.find((m: any) => m.user_id !== currentUserId)?.avatar_url;
    };

    const getChatOnline = (chat: any): boolean | undefined => {
        if (chat.is_group || chat.isChannel) return undefined;
        const other = chat.members.find((m: any) => m.user_id !== currentUserId);
        return other?.online;
    };

    const handleJoinByCode = async () => {
        const code = prompt('Введите код приглашения:');
        if (!code?.trim()) return;
        try {
            await api.joinByCode(code.trim());
            showToast('Вы вступили в чат!', 'success');
            loadChats(currentUserId);
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const handleTogglePin = async (e: React.MouseEvent, chatId: string) => {
        e.stopPropagation();
        try {
            await api.togglePin(chatId);
            // Optimistic update
            const store = useChatStore.getState();
            useChatStore.setState({
                chats: store.chats.map(c => c.id === chatId ? { ...c, isPinned: !c.isPinned } : c),
            });
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    const handleCreateChat = async (memberIds: string[], isGroup: boolean, name?: string, isChannel?: boolean) => {
        await api.createChat(memberIds, isGroup, name, isChannel);
        loadChats(currentUserId);
    };

    return (
        <>
            <aside className="w-[320px] flex-shrink-0 flex flex-col bg-white dark:bg-[#15151c] border-r border-gray-200 dark:border-gray-800">
                <div className="flex justify-between items-center px-4 pt-5 pb-2">
                    <h2 className="text-xl font-bold">Чаты</h2>
                    <div className="flex gap-1">
                        <button className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition" onClick={handleJoinByCode} title="Вступить по коду"><Link2 size={20} /></button>
                        <button className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition" onClick={() => setNewChatOpen(true)} title="Новый чат"><Plus size={20} /></button>
                    </div>
                </div>

                <div className="px-3 pb-3 relative">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input type="text" placeholder="Поиск..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1a1a24] border border-transparent focus:border-accent rounded-xl text-[13px] font-medium outline-none transition" value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 custom-scrollbar">
                    {loading && !chats.length && <p className="p-8 text-center text-[13px] text-gray-400">Загрузка чатов...</p>}

                    {sorted.map(chat => (
                        <button
                            key={chat.id}
                            onClick={() => selectChat(chat.id, currentUserId)}
                            className={`group w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-colors ${selectedId === chat.id ? 'bg-accent/10 dark:bg-accent/15' : 'hover:bg-gray-100 dark:hover:bg-[#20202c]'}`}
                        >
                            <Avatar
                                name={chat.name}
                                size={46}
                                online={getChatOnline(chat)}
                                avatarUrl={getChatAvatar(chat)}
                            />
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-[14px] font-semibold truncate flex items-center gap-1.5">
                                        {chat.isPinned && <Pin size={12} className="text-accent flex-shrink-0" />}
                                        {chat.isChannel ? <Megaphone size={12} className="text-gray-400 flex-shrink-0" /> : chat.is_group && <Users size={12} className="text-gray-400 flex-shrink-0" />}
                                        {chat.name}
                                    </span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {/* Pin button — visible on hover */}
                                        <button
                                            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition ${chat.isPinned ? 'text-accent' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                }`}
                                            onClick={(e) => handleTogglePin(e, chat.id)}
                                            title={chat.isPinned ? 'Открепить' : 'Закрепить'}
                                        >
                                            <Pin size={12} />
                                        </button>
                                        <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">{chat.lastMessageTime}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center gap-2">
                                    <span className="text-[13px] text-gray-500 truncate">{chat.lastMessageText || 'Нет сообщений'}</span>
                                    <Badge count={chat.unread_count} />
                                </div>
                            </div>
                        </button>
                    ))}

                    {!loading && !sorted.length && chats.length > 0 && <p className="p-8 text-center text-[13px] text-gray-400">Ничего не найдено</p>}
                    {!loading && !chats.length && <p className="p-8 text-center text-[13px] text-gray-400">Нет чатов. Нажмите + чтобы начать</p>}
                </div>
            </aside>

            <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} onCreate={handleCreateChat} />
        </>
    );
}