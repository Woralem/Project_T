import React, { useState, useEffect } from 'react';
import { X, Search, MessageCircle, Megaphone, Users, Check } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { useUsers } from '../../hooks/useUsers';

interface Props { open: boolean; onClose: () => void; onCreate: (memberIds: string[], isGroup: boolean, name?: string, isChannel?: boolean) => Promise<void> }

export function NewChatModal({ open, onClose, onCreate }: Props) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<{ id: string; display_name: string }[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isChannel, setIsChannel] = useState(false);
    const [creating, setCreating] = useState(false);
    const { users, loading, search: searchUsers } = useUsers();

    useEffect(() => { if (open) { searchUsers(); setSearch(''); setSelected([]); setGroupName(''); setIsChannel(false); } }, [open]);
    useEffect(() => { const t = setTimeout(() => { if (search) searchUsers(search); }, 300); return () => clearTimeout(t); }, [search]);

    if (!open) return null;

    const toggle = (user: { id: string; display_name: string }) => setSelected(p => p.some(u => u.id === user.id) ? p.filter(u => u.id !== user.id) : [...p, user]);

    const handleCreate = async () => {
        if (!selected.length) return;
        setCreating(true);
        try { const isGrp = isChannel || selected.length > 1; await onCreate(selected.map(u => u.id), isGrp, isGrp ? groupName || undefined : undefined, isChannel || undefined); onClose(); }
        catch (e: any) { alert(e.message || 'Ошибка'); }
        finally { setCreating(false); }
    };

    const showName = selected.length > 1 || isChannel;

    return (
        <>
            <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" onMouseDown={onClose} />
            <div className="fixed inset-0 z-[1010] flex items-center justify-center p-4 pointer-events-none">
                <div className="w-full max-w-[460px] bg-white dark:bg-[#18181f] border border-gray-200 dark:border-white/5 rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[85vh]" onMouseDown={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                        <h3 className="text-lg font-bold">{isChannel ? 'Новый канал' : 'Новый чат'}</h3>
                        <button className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition" onClick={onClose}><X size={24} /></button>
                    </div>

                    <div className="p-6 flex flex-col flex-1 overflow-hidden">
                        <div className="flex p-1 bg-gray-100 dark:bg-[#1a1a24] rounded-xl mb-4 flex-shrink-0">
                            {[{ ch: false, icon: MessageCircle, label: 'Чат / Группа' }, { ch: true, icon: Megaphone, label: 'Канал' }].map(({ ch, icon: Icon, label }) => (
                                <button key={label} className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-semibold rounded-lg transition ${isChannel === ch ? 'bg-white dark:bg-accent text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`} onClick={() => setIsChannel(ch)}><Icon size={16} /> {label}</button>
                            ))}
                        </div>

                        <div className="relative mb-2 flex-shrink-0">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input type="text" placeholder="Найти пользователя..." className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-[#16161e] border border-transparent focus:border-accent rounded-xl text-[14px] outline-none transition" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                        </div>

                        {selected.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
                                {selected.map(u => (
                                    <div key={u.id} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-accent/10 text-accent rounded-full text-[12px] font-semibold cursor-pointer hover:bg-accent/20 transition" onClick={() => toggle(u)}>
                                        {u.display_name} <div className="bg-accent/20 rounded-full p-0.5"><X size={12} /></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showName && <input type="text" placeholder={isChannel ? 'Название канала...' : 'Название группы...'} className="w-full px-4 py-3 mb-4 bg-gray-50 dark:bg-[#16161e] border border-transparent focus:border-accent rounded-xl text-[14px] outline-none transition flex-shrink-0" value={groupName} onChange={e => setGroupName(e.target.value)} />}

                        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
                            {loading && <p className="text-center text-gray-400 text-[13px] py-4">Поиск...</p>}
                            {!loading && !users.length && <p className="text-center text-gray-400 text-[13px] py-4">Никто не найден</p>}
                            {users.map(user => {
                                const isSel = selected.some(u => u.id === user.id);
                                return (
                                    <button key={user.id} className={`w-full flex items-center gap-3 p-2.5 rounded-2xl transition ${isSel ? 'bg-accent/10' : 'hover:bg-gray-100 dark:hover:bg-[#20202c]'}`} onClick={() => toggle(user)}>
                                        <Avatar name={user.display_name} size={42} online={user.online} avatarUrl={user.avatar_url} />
                                        <div className="flex-1 flex flex-col items-start">
                                            <span className="text-[14px] font-semibold">{user.display_name}</span>
                                            <span className="text-[12px] text-gray-500">@{user.username}</span>
                                        </div>
                                        {isSel && <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white"><Check size={12} /></div>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex gap-3 px-6 py-4 bg-gray-50 dark:bg-[#15151c] border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                        <button className="flex-1 py-3 text-[14px] font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-[#20202c] hover:bg-gray-100 dark:hover:bg-[#282836] border border-gray-200 dark:border-transparent rounded-xl transition" onClick={onClose}>Отмена</button>
                        <button className="flex-1 py-3 text-[14px] font-bold text-white bg-accent hover:bg-accent-hover rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(99,102,241,0.2)]" onClick={handleCreate} disabled={!selected.length || creating}>
                            {creating ? 'Создание...' : isChannel ? <><Megaphone size={16} /> Канал</> : selected.length > 1 ? <><Users size={16} /> Группа</> : <><MessageCircle size={16} /> Чат</>}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}