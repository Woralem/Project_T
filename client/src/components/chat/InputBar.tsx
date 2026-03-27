import React, { useState, useRef, useCallback, useEffect } from 'react';
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
    editingMessage: EditableMessage | null;
    onCancelEdit: () => void;
    onAttach: () => void;
}

export function InputBar({
    value, onChange, onSend, onSendVoice,
    editingMessage, onCancelEdit, onAttach,
}: Props) {
    const [recording, setRecording] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Таймер записи
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
                ? 'audio/webm;codecs=opus'
                : 'audio/ogg;codecs=opus';

            const recorder = new MediaRecorder(stream, { mimeType });
            chunks.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.current.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks.current, { type: mimeType });
                if (blob.size > 0) {
                    onSendVoice(blob);
                }
                // Останавливаем микрофон
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };

            recorder.start();
            mediaRecorder.current = recorder;
            setRecording(true);
        } catch (e) {
            console.error('Mic access denied', e);
        }
    }, [onSendVoice]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.stop();
        }
        setRecording(false);
    }, []);

    const cancelRecording = useCallback(() => {
        if (mediaRecorder.current?.state === 'recording') {
            mediaRecorder.current.ondataavailable = null;
            mediaRecorder.current.onstop = null;
            mediaRecorder.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        chunks.current = [];
        setRecording(false);
    }, []);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        if (e.key === 'Escape') {
            if (recording) cancelRecording();
            else if (editingMessage) onCancelEdit();
        }
    };

    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    // ── UI записи ──────────────────────────────────────
    if (recording) {
        return (
            <div className="input-area">
                <div className="input-bar recording-bar">
                    <button className="icon-btn cancel-rec-btn" onClick={cancelRecording} title="Отменить">
                        {Icon.x(20)}
                    </button>

                    <div className="rec-indicator">
                        <span className="rec-dot" />
                        <span className="rec-timer">{fmtTime(recTime)}</span>
                    </div>

                    <button className="send-btn" onClick={stopRecording} title="Отправить">
                        {Icon.send(20)}
                    </button>
                </div>
            </div>
        );
    }

    // ── Обычный UI ─────────────────────────────────────
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
                    <button className="icon-btn mic-btn" onClick={startRecording} title="Голосовое сообщение">
                        {Icon.mic(21)}
                    </button>
                )}
            </div>
        </div>
    );
}