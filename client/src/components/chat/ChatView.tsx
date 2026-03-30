import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LocalChat, LocalMessage, ContextMenuItem, ActiveVoice } from '../../types';
import type { MediaInfo } from './MessageBubble';
import { formatTime } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { ContextMenu } from '../ui/ContextMenu';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';
import { ChatSecurityBanner } from './ChatSecurityBanner';
import { MediaViewer } from '../ui/MediaViewer';
import { VoicePlayerBar } from './VoicePlayerBar';
import { ChatInfoPanel } from './ChatInfoPanel';
import { getFileUrl, getToken } from '../../api';
import { cryptoManager } from '../../crypto';

interface Props {
    chat: LocalChat;
    currentUserId: string;
    loadingMessages?: boolean;
    onSendMessage: (text: string, replyToId?: string) => void;
    onSendVoice: (chatId: string, blob: Blob) => void;
    onSendFile: (chatId: string, file: File, caption: string, replyToId?: string) => Promise<void>;
    onDeleteMessage: (msgId: string) => void;
    onEditMessage: (msgId: string, newText: string) => void;
    onRefreshChat: (chatId: string) => void;
    onStartCall: (chatId: string) => void;
    onOpenProfile?: (userId: string) => void;
    onForwardMessage: (msg: LocalMessage) => void;
    onLoadMore?: (chatId: string) => void;
    onDeleteChat?: (chatId: string) => void;
    onLeaveChat?: (chatId: string) => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
    activeVoice?: ActiveVoice | null;
    onVoiceActivate?: (v: ActiveVoice) => void;
    onVoiceDeactivate?: () => void;
}

function guessMime(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
        mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
        txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript',
        json: 'application/json', xml: 'application/xml',
        zip: 'application/zip', rar: 'application/x-rar-compressed',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[ext] || 'application/octet-stream';
}

async function downloadAndOpen(fileUrl: string, filename: string, chatId?: string, nonce?: string, attachmentId?: string) {
    try {
        const headers: Record<string, string> = {};
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(fileUrl, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        let data = await resp.arrayBuffer();

        if (chatId && nonce && cryptoManager.hasChatKey(chatId)) {
            data = await cryptoManager.decryptBuffer(chatId, data, nonce, attachmentId);
        }

        const contentType = resp.headers.get('content-type') || guessMime(filename);
        const blob = new Blob([data], { type: contentType });

        // Скачиваем через <a download>
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 2000);

        // Для медиа — дополнительно открываем в новой вкладке
        const mime = contentType || '';
        if (mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('video/') || mime.startsWith('audio/')) {
            const viewUrl = URL.createObjectURL(new Blob([data], { type: contentType }));
            window.open(viewUrl, '_blank');
            setTimeout(() => URL.revokeObjectURL(viewUrl), 120000);
        }
    } catch (e) {
        console.error('Download/open failed:', e);
    }
}

export function ChatView({
    chat, currentUserId, loadingMessages,
    onSendMessage, onSendVoice, onSendFile,
    onDeleteMessage, onEditMessage, onRefreshChat, onStartCall,
    onOpenProfile, onForwardMessage, onLoadMore, onDeleteChat, onLeaveChat, showToast,
    activeVoice, onVoiceActivate, onVoiceDeactivate,
}: Props) {
    const [inputText, setInputText] = useState('');
    const [editingMsg, setEditingMsg] = useState<LocalMessage | null>(null);
    const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: LocalMessage } | null>(null);
    const [mediaView, setMediaView] = useState<MediaInfo | null>(null);
    const [sending, setSending] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const getChatAvatar = (): string | undefined => {
        if (chat.is_group) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, [chat.id]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.messages.length, chat.id]);

    useEffect(() => {
        if (!isRecording) setInputText('');
        setEditingMsg(null); setReplyTo(null); setPendingFile(null);
        setCtxMenu(null); setMediaView(null); setInfoOpen(false);
    }, [chat.id]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (mediaView) setMediaView(null);
                else if (ctxMenu) setCtxMenu(null);
                else if (infoOpen) setInfoOpen(false);
                else if (editingMsg) { setEditingMsg(null); setInputText(''); }
                else if (replyTo) setReplyTo(null);
                else if (pendingFile) setPendingFile(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu, editingMsg, replyTo, pendingFile, mediaView, infoOpen]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el || loadingMore || !chat.hasMore || !onLoadMore) return;
        if (el.scrollTop < 100) {
            setLoadingMore(true);
            const prevHeight = el.scrollHeight;
            onLoadMore(chat.id);
            requestAnimationFrame(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevHeight;
                setLoadingMore(false);
            });
        }
    }, [chat.id, chat.hasMore, loadingMore, onLoadMore]);

    const handleMessagesClick = useCallback(() => { inputRef.current?.focus(); }, []);

    const handleSend = useCallback(async () => {
        if (sending) return;
        if (editingMsg) {
            const t = inputText.trim();
            if (t && t !== editingMsg.content) onEditMessage(editingMsg.id, t);
            setEditingMsg(null); setInputText(''); return;
        }
        if (pendingFile) {
            setSending(true);
            try { await onSendFile(chat.id, pendingFile, inputText.trim(), replyTo?.id); setPendingFile(null); setReplyTo(null); setInputText(''); }
            catch (e: any) { showToast(e.message || 'Ошибка отправки файла', 'error'); }
            finally { setSending(false); } return;
        }
        const t = inputText.trim(); if (!t) return;
        onSendMessage(t, replyTo?.id); setReplyTo(null); setInputText('');
    }, [inputText, editingMsg, pendingFile, replyTo, chat.id, sending, onSendMessage, onEditMessage, onSendFile, showToast]);

    const handleSendVoice = useCallback((cid: string, blob: Blob) => { onSendVoice(cid, blob); }, [onSendVoice]);
    const handleSendFile = useCallback((file: File) => { setPendingFile(file); }, []);
    const handleContextMenu = (e: React.MouseEvent, msg: LocalMessage) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, message: msg }); };

    const ctxItems = (msg: LocalMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        items.push({ label: 'Ответить', icon: Icon.reply(16), onClick: () => { setReplyTo(msg); setEditingMsg(null); } });
        items.push({ label: 'Переслать', icon: Icon.forward(16), onClick: () => onForwardMessage(msg) });
        if (msg.own && msg.status !== 'pending' && !msg.attachment) {
            items.push({ label: 'Редактировать', icon: Icon.edit(16), onClick: () => { setEditingMsg(msg); setInputText(msg.content); setReplyTo(null); } });
        }
        items.push({ label: 'Копировать', icon: Icon.copy(16), onClick: () => { navigator.clipboard.writeText(msg.content); showToast('Скопировано'); } });
        if (msg.attachment) {
            items.push({
                label: 'Скачать файл', icon: Icon.download(16),
                onClick: () => {
                    const att = msg.attachment!;
                    const isEnc = !!msg.encrypted?.nonce;
                    downloadAndOpen(
                        getFileUrl(att.id), att.filename,
                        isEnc ? chat.id : undefined,
                        isEnc ? msg.encrypted!.nonce : undefined, att.id
                    );
                }
            });
        }
        if (msg.own) items.push({ label: 'Удалить', icon: Icon.trash(16), danger: true, onClick: () => onDeleteMessage(msg.id) });
        return items;
    };

    const handleRefresh = useCallback(() => { onRefreshChat(chat.id); }, [onRefreshChat, chat.id]);
    const handleCall = useCallback(() => {
        if (chat.is_group) { showToast('Групповые звонки пока не поддерживаются', 'info'); return; }
        onStartCall(chat.id);
    }, [chat.id, chat.is_group, onStartCall, showToast]);

    const handleHeaderClick = useCallback(() => { setInfoOpen(v => !v); }, []);
    const handleAuthorClick = useCallback((userId: string) => { if (onOpenProfile) onOpenProfile(userId); }, [onOpenProfile]);

    const handleClickReply = useCallback((messageId: string) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('msg-highlight'); setTimeout(() => el.classList.remove('msg-highlight'), 1500); }
    }, []);

    const handleOpenMedia = useCallback((info: MediaInfo) => { setMediaView(info); }, []);

    const handleLeave = useCallback(() => {
        if (!confirm('Покинуть этот чат?')) return;
        onLeaveChat?.(chat.id);
    }, [chat.id, onLeaveChat]);
    const handleDelete = useCallback(() => {
        if (!confirm('Удалить этот чат для всех?')) return;
        onDeleteChat?.(chat.id);
    }, [chat.id, onDeleteChat]);

    return (
        <section className="chat-view">
            <div className="chat-view-main">
                <div className="chat-header">
                    <div className="chat-header-left" style={{ cursor: 'pointer' }} onClick={handleHeaderClick}>
                        <Avatar name={chat.name} size={38} online={chat.is_group ? undefined : chat.online} avatarUrl={getChatAvatar()} />
                        <div className="chat-header-info">
                            <h3>{chat.name}</h3>
                            <span className="chat-header-sub">{chat.is_group ? `${chat.members.length} участников` : chat.online ? 'в сети' : 'был(а) недавно'}</span>
                        </div>
                    </div>
                    <div className="chat-header-actions">
                        <button className="icon-btn" title="Позвонить" onClick={handleCall}>{Icon.phone(20)}</button>
                        <button className="icon-btn" title="Инфо" onClick={handleHeaderClick}>{Icon.info(20)}</button>
                    </div>
                </div>

                <ChatSecurityBanner chat={chat} currentUserId={currentUserId} onRefresh={handleRefresh} showToast={showToast} />
                {activeVoice && <VoicePlayerBar voice={activeVoice} onClose={() => onVoiceDeactivate?.()} />}

                <div className="messages-scroll" ref={scrollRef} onScroll={handleScroll} onClick={handleMessagesClick}>
                    <div className="messages-inner">
                        {loadingMore && <div className="messages-loading" style={{ padding: 8 }}>Загрузка...</div>}
                        <div className="encryption-notice">{Icon.lock(14)}<span>Сообщения защищены сквозным шифрованием</span></div>
                        {loadingMessages && chat.messages.length === 0 && <div className="messages-loading">Загрузка сообщений...</div>}
                        {!loadingMessages && chat.messagesLoaded && chat.messages.length === 0 && <div className="messages-loading">Нет сообщений. Напишите первое!</div>}

                        {chat.messages.map((msg, i) => {
                            const prev = chat.messages[i - 1];
                            const isFirst = !prev || prev.own !== msg.own || prev.sender_id !== msg.sender_id;
                            return (
                                <MessageBubble key={msg.id} message={msg} isFirst={isFirst} isGroup={chat.is_group}
                                    chatId={chat.id} onContextMenu={e => handleContextMenu(e, msg)}
                                    onClickAuthor={handleAuthorClick} onClickReply={handleClickReply}
                                    onOpenMedia={handleOpenMedia}
                                    onVoiceActivate={onVoiceActivate} onVoiceDeactivate={onVoiceDeactivate} />
                            );
                        })}
                        <div ref={bottomRef} />
                    </div>
                </div>

                <InputBar
                    chatId={chat.id}
                    value={inputText} onChange={setInputText}
                    onSend={handleSend} onSendVoice={handleSendVoice} onSendFile={handleSendFile}
                    editingMessage={editingMsg ? { id: editingMsg.id, text: editingMsg.content, author: editingMsg.sender_name, time: formatTime(editingMsg.created_at), own: editingMsg.own } : null}
                    onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
                    replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
                    pendingFile={pendingFile} onCancelFile={() => setPendingFile(null)}
                    inputRef={inputRef}
                    onRecordingChange={setIsRecording} />

                {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu.message)} onClose={() => setCtxMenu(null)} />}
                {mediaView && <MediaViewer {...mediaView} onClose={() => setMediaView(null)} />}
            </div>

            {infoOpen && (
                <ChatInfoPanel chat={chat} currentUserId={currentUserId}
                    onClose={() => setInfoOpen(false)} onOpenProfile={handleAuthorClick}
                    onLeaveChat={handleLeave} onDeleteChat={handleDelete} />
            )}
        </section>
    );
}