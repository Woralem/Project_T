import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Send, Mic, X, Edit2, Check, Square, Loader2, Image, Lock, Reply } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { cryptoManager } from '../../crypto';
import * as api from '../../api';
import { formatDuration } from '../../utils';
import type { AttachmentDto } from '../../types';

interface Props {
    chatId: string;
    onSend: (text: string, attachmentId?: string, fileNonce?: string) => void;
    editingText?: string;
    onCancelEdit?: () => void;
    replyTo?: { sender_name: string; content: string; attachment?: AttachmentDto } | null;
    onCancelReply?: () => void;
}

export function InputBar({ chatId, onSend, editingText, onCancelEdit, replyTo, onCancelReply }: Props) {
    const [text, setText] = useState('');
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recTime, setRecTime] = useState(0);
    const [pastedFile, setPastedFile] = useState<{ file: File; preview: string } | null>(null);
    const showToast = useUiStore(s => s.showToast);
    const fileRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mediaRecRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isEditing = editingText !== undefined;

    useEffect(() => { setText(isEditing ? editingText! : ''); }, [editingText]);

    // Re-focus textarea when switching chats
    useEffect(() => {
        textareaRef.current?.focus();
    }, [chatId]);

    // Ctrl+V
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.kind === 'file') {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;
                    if (file.size > 25 * 1024 * 1024) { showToast('Макс 25МБ', 'error'); return; }
                    if (file.type.startsWith('image/')) {
                        setPastedFile({ file, preview: URL.createObjectURL(file) });
                    } else {
                        uploadAndSend(file);
                    }
                    return;
                }
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [showToast, chatId]);

    useEffect(() => {
        return () => { if (pastedFile?.preview) URL.revokeObjectURL(pastedFile.preview); };
    }, [pastedFile]);

    const uploadAndSend = async (file: File) => {
        setUploading(true);
        try {
            let blob: Blob = file;
            let fileNonce: string | undefined;
            if (cryptoManager.hasChatKey(chatId)) {
                const arrayBuf = await file.arrayBuffer();
                const { encryptedData, nonce } = await cryptoManager.encryptBuffer(chatId, arrayBuf);
                blob = new Blob([encryptedData], { type: 'application/octet-stream' });
                fileNonce = nonce;
            }
            const att = await api.uploadFile(blob, file.name);
            onSend(text.trim() || '', att.id, fileNonce);
            setText('');
            setPastedFile(null);
            showToast('Файл отправлен', 'success');
        } catch (err: any) {
            showToast(err.message || 'Ошибка загрузки', 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleSend = () => {
        if (pastedFile) { uploadAndSend(pastedFile.file); return; }
        if (!text.trim()) return;
        onSend(text);
        setText('');
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
        if (e.key === 'Escape') {
            if (pastedFile) { cancelPaste(); return; }
            if (replyTo && onCancelReply) { onCancelReply(); return; }
            if (onCancelEdit) { onCancelEdit(); setText(''); }
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) { showToast('Макс 25МБ', 'error'); return; }
        await uploadAndSend(file);
        if (fileRef.current) fileRef.current.value = '';
    };

    const cancelPaste = () => {
        if (pastedFile?.preview) URL.revokeObjectURL(pastedFile.preview);
        setPastedFile(null);
    };

    // Voice recording
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
            });
            chunksRef.current = [];
            mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                const raw = new Blob(chunksRef.current, { type: 'audio/webm' });
                if (raw.size < 1000) { setRecording(false); return; }

                setUploading(true);
                try {
                    let blob: Blob = raw;
                    let fileNonce: string | undefined;
                    if (cryptoManager.hasChatKey(chatId)) {
                        const buf = await raw.arrayBuffer();
                        const enc = await cryptoManager.encryptBuffer(chatId, buf);
                        blob = new Blob([enc.encryptedData], { type: 'application/octet-stream' });
                        fileNonce = enc.nonce;
                    }
                    const att = await api.uploadFile(blob, `voice_${Date.now()}.webm`);
                    onSend('', att.id, fileNonce);
                    showToast('Голосовое отправлено', 'success');
                } catch (err: any) { showToast(err.message || 'Ошибка', 'error'); }
                finally { setUploading(false); }
                setRecording(false); setRecTime(0);
            };
            mr.start(250);
            mediaRecRef.current = mr;
            setRecording(true); setRecTime(0);
            timerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
        } catch { showToast('Микрофон недоступен', 'error'); }
    }, [onSend, showToast, chatId]);

    const stopRecording = useCallback(() => mediaRecRef.current?.stop(), []);
    const cancelRecording = useCallback(() => {
        if (mediaRecRef.current?.state !== 'inactive') {
            mediaRecRef.current!.ondataavailable = null;
            mediaRecRef.current!.onstop = () => {
                mediaRecRef.current?.stream.getTracks().forEach(t => t.stop());
                setRecording(false); setRecTime(0);
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            };
            mediaRecRef.current!.stop();
        }
    }, []);

    const hasE2E = cryptoManager.hasChatKey(chatId);
    const hasContent = text.trim() || pastedFile;

    const replyPreviewText = replyTo
        ? (replyTo.attachment ? `📎 ${replyTo.attachment.filename}` : replyTo.content)
        : '';

    if (recording) {
        return (
            <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#15151c]">
                <div className="flex items-center gap-2 flex-1">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[14px] font-medium text-red-500">Запись {formatDuration(recTime)}</span>
                    <div className="flex-1 flex items-center gap-0.5 px-2">
                        {Array.from({ length: 20 }, (_, i) => (
                            <div key={i} className="w-1 bg-red-400/60 rounded-full animate-pulse" style={{ height: Math.random() * 16 + 4, animationDelay: `${i * 50}ms` }} />
                        ))}
                    </div>
                    {hasE2E && <Lock size={12} className="text-green-500" />}
                </div>
                <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition active:scale-90" onClick={cancelRecording}><X size={22} /></button>
                <button className="w-10 h-10 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full transition hover:scale-105 active:scale-95 shadow-md" onClick={stopRecording}><Square size={16} fill="white" /></button>
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-white dark:bg-[#15151c]">
            {/* Reply preview */}
            {replyTo && (
                <div className="flex items-center gap-3 px-4 py-2 bg-accent/5 border-b border-gray-200 dark:border-white/5 animate-in fade-in duration-150">
                    <Reply size={16} className="text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-accent">{replyTo.sender_name}</div>
                        <div className="text-[13px] text-gray-500 truncate">{replyPreviewText}</div>
                    </div>
                    <button className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition flex-shrink-0" onClick={onCancelReply}><X size={16} /></button>
                </div>
            )}

            {/* Pasted image preview */}
            {pastedFile && (
                <div className="px-4 pt-3 pb-1 animate-in fade-in duration-200">
                    <div className="relative inline-block">
                        <img src={pastedFile.preview} alt="" className="max-h-[200px] max-w-[300px] rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                        <button className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 flex items-center justify-center hover:scale-110 transition shadow-lg" onClick={cancelPaste}><X size={14} /></button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                        <Image size={12} /> {pastedFile.file.name}
                        {hasE2E && <><Lock size={10} className="text-green-500" /> шифруется</>}
                        <span className="text-gray-300">— Enter ↵ / Esc ✕</span>
                    </p>
                </div>
            )}

            {/* Editing bar */}
            {isEditing && (
                <div className="flex items-center gap-3 px-4 py-2 bg-accent/5 border-b border-gray-200 dark:border-white/5">
                    <Edit2 size={16} className="text-accent" />
                    <div className="flex-1 min-w-0"><div className="text-[12px] font-bold text-accent">Редактирование</div><div className="text-[13px] text-gray-500 truncate">{editingText}</div></div>
                    <button className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition" onClick={() => { onCancelEdit?.(); setText(''); }}><X size={16} /></button>
                </div>
            )}

            <div className="flex items-center gap-2 px-3.5 py-2.5">
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />
                <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition disabled:opacity-40" onClick={() => fileRef.current?.click()} disabled={uploading} title="Прикрепить файл">
                    {uploading ? <Loader2 size={22} className="animate-spin" /> : <Paperclip size={22} />}
                </button>

                <textarea
                    ref={textareaRef}
                    className="flex-1 max-h-[150px] min-h-[40px] px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-[#1a1a24] text-[14px] leading-[1.4] border border-transparent focus:border-accent outline-none resize-none custom-scrollbar transition"
                    placeholder="Написать сообщение..."
                    rows={1}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    autoFocus
                />

                {hasContent ? (
                    <button className="w-10 h-10 flex items-center justify-center bg-accent hover:bg-accent-hover text-white rounded-full transition hover:scale-105 active:scale-95 shadow-md disabled:opacity-50" onClick={handleSend} disabled={uploading}>
                        {uploading ? <Loader2 size={18} className="animate-spin" /> : isEditing ? <Check size={18} /> : <Send size={18} />}
                    </button>
                ) : (
                    <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition" onClick={startRecording} title="Голосовое"><Mic size={22} /></button>
                )}
            </div>
        </div>
    );
}