import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LocalMessage } from '../../types';
import { Icon } from '../../icons';

interface EditableMessage { id: string; text: string; author: string; time: string; own: boolean; }

interface Props {
    chatId: string;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onSendVoice: (chatId: string, blob: Blob) => void;
    onSendFile: (file: File) => void;
    editingMessage: EditableMessage | null;
    onCancelEdit: () => void;
    replyTo: LocalMessage | null;
    onCancelReply: () => void;
    pendingFile: File | null;
    onCancelFile: () => void;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    onRecordingChange?: (recording: boolean) => void;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

export function InputBar({
    chatId, value, onChange, onSend, onSendVoice, onSendFile,
    editingMessage, onCancelEdit, replyTo, onCancelReply,
    pendingFile, onCancelFile, inputRef, onRecordingChange,
}: Props) {
    const [recording, setRecording] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [dragOver, setDragOver] = useState(false);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const localTextareaRef = useRef<HTMLTextAreaElement>(null);
    const recordingChatIdRef = useRef<string>(chatId);
    const textareaRef = inputRef || localTextareaRef;

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }, [value]);

    useEffect(() => {
        if (recording) {
            setRecTime(0);
            timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
        } else if (timerRef.current) clearInterval(timerRef.current);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [recording]);

    const setRec = useCallback((v: boolean) => { setRecording(v); onRecordingChange?.(v); }, [onRecordingChange]);

    const startRecording = useCallback(async () => {
        try {
            recordingChatIdRef.current = chatId;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
            const rec = new MediaRecorder(stream, { mimeType });
            chunks.current = [];
            rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
            rec.onstop = () => {
                const blob = new Blob(chunks.current, { type: mimeType });
                if (blob.size > 0) onSendVoice(recordingChatIdRef.current, blob);
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };
            rec.start();
            mediaRecorder.current = rec;
            setRec(true);
        } catch (e) { console.error('Mic access denied', e); }
    }, [chatId, onSendVoice, setRec]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
        setRec(false);
    }, [setRec]);

    const cancelRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.ondataavailable = null;
            mediaRecorder.current.onstop = null;
            mediaRecorder.current.stop();
        }
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        chunks.current = [];
        setRec(false);
    }, [setRec]);

    const handleFileSelect = useCallback(() => { fileInputRef.current?.click(); }, []);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) { alert('Файл слишком большой (макс 25MB)'); return; }
        onSendFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) { alert('Файл слишком большой (макс 25MB)'); return; }
        onSendFile(file);
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        if (e.key === 'Escape') {
            if (recording) cancelRecording();
            else if (editingMessage) onCancelEdit();
            else if (replyTo) onCancelReply();
            else if (pendingFile) onCancelFile();
        }
    };

    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    if (recording) return (
        <div className="input-area"><div className="input-bar recording-bar">
            <button className="icon-btn cancel-rec-btn" onClick={cancelRecording} title="Отменить">{Icon.x(20)}</button>
            <div className="rec-indicator"><span className="rec-dot" /><span className="rec-timer">{fmtTime(recTime)}</span></div>
            <button className="send-btn" onClick={stopRecording} title="Отправить">{Icon.send(20)}</button>
        </div></div>
    );

    return (
        <div className={`input-area ${dragOver ? 'input-drag-over' : ''}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />

            {replyTo && !editingMessage && (
                <div className="edit-bar reply-bar">
                    <span className="edit-bar-icon">{Icon.reply(15)}</span>
                    <div className="edit-bar-body">
                        <span className="edit-bar-label" style={{ color: 'var(--accent)' }}>{replyTo.sender_name}</span>
                        <span className="edit-bar-text">{replyTo.attachment ? `📎 ${replyTo.attachment.filename}` : replyTo.content}</span>
                    </div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelReply}>{Icon.x(16)}</button>
                </div>
            )}
            {editingMessage && (
                <div className="edit-bar">
                    <span className="edit-bar-icon">{Icon.edit(15)}</span>
                    <div className="edit-bar-body"><span className="edit-bar-label">Редактирование</span><span className="edit-bar-text">{editingMessage.text}</span></div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelEdit}>{Icon.x(16)}</button>
                </div>
            )}
            {pendingFile && (
                <div className="edit-bar file-bar">
                    <span className="edit-bar-icon">{pendingFile.type.startsWith('image/') ? Icon.image(15) : Icon.file(15)}</span>
                    <div className="edit-bar-body"><span className="edit-bar-label">Файл</span><span className="edit-bar-text">{pendingFile.name} ({formatFileSize(pendingFile.size)})</span></div>
                    <button className="icon-btn edit-bar-close" onClick={onCancelFile}>{Icon.x(16)}</button>
                </div>
            )}
            {dragOver && <div className="drop-overlay">Отпустите файл для отправки</div>}

            <div className="input-bar">
                <button className="icon-btn attach-btn" onClick={handleFileSelect} title="Прикрепить файл">{Icon.paperclip(21)}</button>
                <textarea
                    ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
                    className="msg-input msg-textarea"
                    placeholder={editingMessage ? 'Редактировать сообщение...' : pendingFile ? 'Подпись к файлу...' : 'Написать сообщение...'}
                    value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKey} rows={1}
                />
                {(value.trim() || pendingFile) ? (
                    <button className="send-btn" onClick={onSend} title="Отправить">{editingMessage ? Icon.check(20) : Icon.send(20)}</button>
                ) : (
                    <button className="icon-btn mic-btn" onClick={startRecording} title="Голосовое сообщение">{Icon.mic(21)}</button>
                )}
            </div>
        </div>
    );
}