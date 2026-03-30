import React, { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import type { UserDto } from '../../types';
import { useUsers } from '../../hooks/useUsers';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (memberIds: string[], isGroup: boolean, name?: string, isChannel?: boolean) => Promise<any>;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function NewChatModal({ open, onClose, onCreate, showToast }: Props) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<UserDto[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isGroup, setIsGroup] = useState(false);
    const [isChannel, setIsChannel] = useState(false);
    const { users, loading, search: searchUsers } = useUsers();

    useEffect(() => {
        if (open) { searchUsers(); setSearch(''); setSelected([]); setGroupName(''); setIsGroup(false); setIsChannel(false); }
    }, [open, searchUsers]);

    useEffect(() => { const t = setTimeout(() => { if (search) searchUsers(search); }, 300); return () => clearTimeout(t); }, [search, searchUsers]);

    if (!open) return null;

    const toggleUser = (user: UserDto) => {
        setSelected(prev => prev.some(u => u.id === user.id) ? prev.filter(u => u.id !== user.id) : [...prev, user]);
    };

    const handleCreate = async () => {
        if (selected.length === 0) return;
        try {
            await onCreate(selected.map(u => u.id), isGroup || isChannel || selected.length > 1, (isGroup || isChannel) ? groupName || undefined : undefined, isChannel || undefined);
            onClose();
            showToast(isChannel ? 'Канал создан' : 'Чат создан', 'success');
        } catch (e: any) { showToast(e.message || 'Ошибка', 'error'); }
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal-card modal-wide" onMouseDown={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isChannel ? 'Новый канал' : 'Новый чат'}</h3>
                    <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
                </div>

                {/* Тип */}
                <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                    <button className={`auth-tab ${!isChannel ? 'active' : ''}`} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 13 }}
                        onClick={() => setIsChannel(false)}>💬 Чат / Группа</button>
                    <button className={`auth-tab ${isChannel ? 'active' : ''}`} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: 13 }}
                        onClick={() => { setIsChannel(true); setIsGroup(true); }}>📢 Канал</button>
                </div>

                <div className="search-wrap" style={{ padding: '8px 0' }}>
                    <span className="search-ico">{Icon.search(16)}</span>
                    <input type="text" placeholder="Найти пользователя..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                </div>

                {selected.length > 0 && (
                    <div className="selected-users">
                        {selected.map(u => (<div key={u.id} className="selected-chip" onClick={() => toggleUser(u)}>{u.display_name}<span style={{ marginLeft: 4, opacity: 0.6 }}>×</span></div>))}
                    </div>
                )}

                {(selected.length > 1 || isChannel) && (
                    <div className="field fade-in" style={{ margin: '8px 0' }}>
                        <label>{isChannel ? 'Название канала' : 'Название группы'}</label>
                        <input type="text" placeholder={isChannel ? 'Название канала...' : 'Название группы...'} value={groupName} onChange={e => setGroupName(e.target.value)} />
                    </div>
                )}

                <div className="user-list">
                    {loading && <div className="chat-list-empty">Загрузка...</div>}
                    {!loading && users.length === 0 && <div className="chat-list-empty">Не найдено</div>}
                    {users.map(user => (
                        <button key={user.id} className={`chat-item ${selected.some(u => u.id === user.id) ? 'active' : ''}`} onClick={() => toggleUser(user)}>
                            <Avatar name={user.display_name} size={40} online={user.online} />
                            <div className="chat-item-body"><span className="chat-item-name">{user.display_name}</span><span className="chat-item-preview">@{user.username}</span></div>
                        </button>
                    ))}
                </div>

                <div className="modal-actions">
                    <button className="modal-btn-secondary" onClick={onClose}>Отмена</button>
                    <button className="modal-btn-primary" onClick={handleCreate} disabled={selected.length === 0}>
                        {isChannel ? '📢 Создать канал' : selected.length > 1 ? 'Создать группу' : 'Начать чат'}
                    </button>
                </div>
            </div>
        </div>
    );
}