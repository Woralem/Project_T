import React, { useState } from 'react';
import { Icon } from '../../icons';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (name: string) => void;
}

export function NewChatModal({ open, onClose, onCreate }: Props) {
    const [name, setName] = useState('');

    if (!open) return null;

    const handleCreate = () => {
        if (!name.trim()) return;
        onCreate(name.trim());
        setName('');
        onClose();
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleCreate();
        if (e.key === 'Escape') onClose();
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal-card" onMouseDown={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Новый чат</h3>
                    <button className="icon-btn" onClick={onClose}>{Icon.x(18)}</button>
                </div>

                <div className="field" style={{ marginTop: 16 }}>
                    <label>Имя собеседника</label>
                    <input
                        type="text"
                        placeholder="Введите имя..."
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={onKey}
                        autoFocus
                    />
                </div>

                <div className="modal-actions">
                    <button className="modal-btn-secondary" onClick={onClose}>Отмена</button>
                    <button className="modal-btn-primary" onClick={handleCreate}>Создать</button>
                </div>
            </div>
        </div>
    );
}