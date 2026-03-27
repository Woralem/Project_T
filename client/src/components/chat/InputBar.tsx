import React from 'react';
import { Icon } from '../../icons';

interface EditableMessage {
    id: string;
    text: string;
    author: string;
    time: string;
    own: boolean;
}

interface Props {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    editingMessage: EditableMessage | null;
    onCancelEdit: () => void;
    onAttach: () => void;
    onMic: () => void;
}

export function InputBar({
    value, onChange, onSend,
    editingMessage, onCancelEdit,
    onAttach, onMic,
}: Props) {
    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
        if (e.key === 'Escape' && editingMessage) {
            onCancelEdit();
        }
    };

    return (
        <div className="input-area">
            {editingMessage && (
                <div className="edit-bar">
                    <span className="edit-bar-icon">{Icon.edit(15)}</span>
                    <div className="edit-bar-body">
                        <span className="edit-bar-label">Редактирование</span>
                        <span className="edit-bar-text">{editingMessage.text}</span>
                    </div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelEdit}>
                        {Icon.x(16)}
                    </button>
                </div>
            )}

            <div className="input-bar">
                <button className="icon-btn attach-btn" onClick={onAttach} title="Прикрепить файл">
                    {Icon.paperclip(21)}
                </button>
                <input
                    className="msg-input"
                    type="text"
                    placeholder={editingMessage ? 'Редактировать сообщение...' : 'Написать сообщение...'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={onKey}
                    autoFocus
                />
                {value.trim() ? (
                    <button className="send-btn" onClick={onSend} title="Отправить">
                        {editingMessage ? Icon.check(20) : Icon.send(20)}
                    </button>
                ) : (
                    <button className="icon-btn mic-btn" onClick={onMic} title="Голосовое сообщение">
                        {Icon.mic(21)}
                    </button>
                )}
            </div>
        </div>
    );
}