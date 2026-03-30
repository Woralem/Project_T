import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LocalMessage } from '../../types';
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
    onSendVoice: (blob: Blob) => void;
    onSendFile: (file: File) => void;
    editingMessage: EditableMessage | null;
    onCancelEdit: () => void;
    replyTo: LocalMessage | null;
    onCancelReply: () => void;
    pendingFile: File | null;
    onCancelFile: () => void;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

export function InputBar({
    value, onChange, onSend, onSendVoice, onSendFile,
    editingMessage, onCancelEdit,
    replyTo, onCancelReply,
    pendingFile, onCancelFile,
}: Props) {
    const [recording, setRecording] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [dragOver, setDragOver] = useState(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (recording) {
            setRecTime(0);
            timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [recording]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
            const recorder = new MediaRecorder(stream, { mimeType });
            chunks.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunks.current, { type: mimeType });
                if (blob.size > 0) onSendVoice(blob);
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };
            recorder.start();
            mediaRecorder.current = recorder;
            setRecording(true);
        } catch (e) { console.error('Mic access denied', e); }
    }, [onSendVoice]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
        setRecording(false);
    }, []);

    const cancelRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.ondataavailable = null;
            mediaRecorder.current.onstop = null;
            mediaRecorder.current.stop();
        }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        chunks.current = [];
        setRecording(false);
    }, []);

    const handleFileSelect = useCallback(() => { fileInputRef.current?.click(); }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) { alert('Файл слишком большой (макс 25MB)'); return; }
        onSendFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) { alert('Файл слишком большой (макс 25MB)'); return; }
        onSendFile(file);
    };

    const handleSendWithFile = () => {
        if (pendingFile) {
            onSend(); // ChatView handles the file+text send
        } else {
            onSend();
        }
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWithFile(); }
        if (e.key === 'Escape') {
            if (recording) cancelRecording();
            else if (editingMessage) onCancelEdit();
            else if (replyTo) onCancelReply();
            else if (pendingFile) onCancelFile();
        }
    };

    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    if (recording) {
        return (
            <div className="input-area">
                <div className="input-bar recording-bar">
                    <button className="icon-btn cancel-rec-btn" onClick={cancelRecording} title="Отменить">{Icon.x(20)}</button>
                    <div className="rec-indicator">
                        <span className="rec-dot" />
                        <span className="rec-timer">{fmtTime(recTime)}</span>
                    </div>
                    <button className="send-btn" onClick={stopRecording} title="Отправить">{Icon.send(20)}</button>
                </div>
            </div>
        );
    }

    return (
        <div className={`input-area ${dragOver ? 'input-drag-over' : ''}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

            <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                onChange={handleFileChange} />

            {/* Reply bar */}
            {replyTo && !editingMessage && (
                <div className="edit-bar reply-bar">
                    <span className="edit-bar-icon">{Icon.reply(15)}</span>
                    <div className="edit-bar-body">
                        <span className="edit-bar-label" style={{ color: 'var(--accent)' }}>
                            {replyTo.sender_name}
                        </span>
                        <span className="edit-bar-text">
                            {replyTo.attachment ? `📎 ${replyTo.attachment.filename}` : replyTo.content}
                        </span>
                    </div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelReply}>{Icon.x(16)}</button>
                </div>
            )}

            {/* Edit bar */}
            {editingMessage && (
                <div className="edit-bar">
                    <span className="edit-bar-icon">{Icon.edit(15)}</span>
                    <div className="edit-bar-body">
                        <span className="edit-bar-label">Редактирование</span>
                        <span className="edit-bar-text">{editingMessage.text}</span>
                    </div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelEdit}>{Icon.x(16)}</button>
                </div>
            )}

            {/* Pending file bar */}
            {pendingFile && (
                <div className="edit-bar file-bar">
                    <span className="edit-bar-icon">
                        {pendingFile.type.startsWith('image/') ? Icon.image(15) : Icon.file(15)}
                    </span>
                    <div className="edit-bar-body">
                        <span className="edit-bar-label">Файл</span>
                        <span className="edit-bar-text">
                            {pendingFile.name} ({formatFileSize(pendingFile.size)})
                        </span>
                    </div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelFile}>{Icon.x(16)}</button>
                </div>
            )}

            {dragOver && (
                <div className="drop-overlay">Отпустите файл для отправки</div>
            )}

            <div className="input-bar">
                <button className="icon-btn attach-btn" onClick={handleFileSelect} title="Прикрепить файл">
                    {Icon.paperclip(21)}
                </button>
                <input
                    className="msg-input" type="text"
                    placeholder={
                        editingMessage ? 'Редактировать сообщение...' :
                            pendingFile ? 'Подпись к файлу (необязательно)...' :
                                'Написать сообщение...'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={onKey}
                    autoFocus
                />
                {(value.trim() || pendingFile) ? (
                    <button className="send-btn" onClick={handleSendWithFile} title="Отправить">
                        {editingMessage ? Icon.check(20) : Icon.send(20)}
                    </button>
                ) : (
                    <button className="icon-btn mic-btn" onClick={startRecording} title="Голосовое сообщение">
                        {Icon.mic(21)}
                    </button>
                )}
            </div>
        </div>
    );
}