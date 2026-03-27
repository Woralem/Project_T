import React, { useState, useEffect } from 'react';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import type { UserDto } from '../../types';
import { useUsers } from '../../hooks/useUsers';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (memberIds: string[], isGroup: boolean, name?: string) => Promise<any>;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function NewChatModal({ open, onClose, onCreate, showToast }: Props) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<UserDto[]>([]);
    const [groupName, setGroupName] = useState('');
    const [isGroup, setIsGroup] = useState(false);
    const { users, loading, search: searchUsers } = useUsers();

    useEffect(() => {
        if (open) {
            searchUsers();
            setSearch('');
            setSelected([]);
            setGroupName('');
            setIsGroup(false);
        }
    }, [open, searchUsers]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (search) searchUsers(search);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, searchUsers]);

    if (!open) return null;

    const toggleUser = (user: UserDto) => {
        setSelected(prev =>
            prev.some(u => u.id === user.id)
                ? prev.filter(u => u.id !== user.id)
                : [...prev, user]
        );
    };

    const handleCreate = async () => {
        if (selected.length === 0) return;
        try {
            await onCreate(
                selected.map(u => u.id),
                isGroup || selected.length > 1,
                isGroup ? groupName || undefined : undefined,
            );
            onClose();
            showToast('Чат создан', 'success');
        } catch (e: any) {
            showToast(e.message || 'Ошибка создания чата', 'error');
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal-card modal-wide" onMouseDown={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Новый чат</h3>
                    <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
                </div>

                {/* Поиск */}
                <div className="search-wrap" style={{ padding: '12px 0' }}>
                    <span className="search-ico">{Icon.search(16)}</span>
                    <input
                        type="text"
                        placeholder="Найти пользователя..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Выбранные */}
                {selected.length > 0 && (
                    <div className="selected-users">
                        {selected.map(u => (
                            <div key={u.id} className="selected-chip" onClick={() => toggleUser(u)}>
                                {u.display_name}
                                <span style={{ marginLeft: 4, opacity: 0.6 }}>×</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Групповой чат */}
                {selected.length > 1 && (
                    <div className="field fade-in" style={{ margin: '8px 0' }}>
                        <label>Название группы</label>
                        <input
                            type="text"
                            placeholder="Название группы..."
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                        />
                    </div>
                )}

                {/* Список юзеров */}
                <div className="user-list">
                    {loading && <div className="chat-list-empty">Загрузка...</div>}
                    {!loading && users.length === 0 && (
                        <div className="chat-list-empty">Пользователи не найдены</div>
                    )}
                    {users.map(user => (
                        <button
                            key={user.id}
                            className={`chat-item ${selected.some(u => u.id === user.id) ? 'active' : ''}`}
                            onClick={() => toggleUser(user)}
                        >
                            <Avatar name={user.display_name} size={40} online={user.online} />
                            <div className="chat-item-body">
                                <span className="chat-item-name">{user.display_name}</span>
                                <span className="chat-item-preview">@{user.username}</span>
                            </div>
                        </button>
                    ))}
                </div>

                <div className="modal-actions">
                    <button className="modal-btn-secondary" onClick={onClose}>Отмена</button>
                    <button
                        className="modal-btn-primary"
                        onClick={handleCreate}
                        disabled={selected.length === 0}
                    >
                        {selected.length > 1 ? 'Создать группу' : 'Начать чат'}
                    </button>
                </div>
            </div>
        </div>
    );
}