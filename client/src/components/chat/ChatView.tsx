import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LocalChat, LocalMessage, ContextMenuItem } from '../../types';
import type { MediaInfo } from './MessageBubble';
import { formatTime } from '../../utils';
import { Icon } from '../../icons';
import { Avatar } from '../ui/Avatar';
import { ContextMenu } from '../ui/ContextMenu';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';
import { ChatSecurityBanner } from './ChatSecurityBanner';
import { MediaViewer } from '../ui/MediaViewer';

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
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function ChatView({
    chat, currentUserId, loadingMessages,
    onSendMessage, onSendVoice, onSendFile,
    onDeleteMessage, onEditMessage, onRefreshChat, onStartCall,
    onOpenProfile, onForwardMessage, showToast,
}: Props) {
    const [inputText, setInputText] = useState('');
    const [editingMsg, setEditingMsg] = useState<LocalMessage | null>(null);
    const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: LocalMessage } | null>(null);
    const [mediaView, setMediaView] = useState<MediaInfo | null>(null);
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const getChatAvatar = (): string | undefined => {
        if (chat.is_group) return undefined;
        return chat.members.find(m => m.user_id !== currentUserId)?.avatar_url || undefined;
    };

    const handleHeaderAvatarClick = () => {
        if (!onOpenProfile || chat.is_group) return;
        const other = chat.members.find(m => m.user_id !== currentUserId);
        if (other) onOpenProfile(other.user_id);
    };

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.messages.length, chat.id]);
    useEffect(() => { setInputText(''); setEditingMsg(null); setReplyTo(null); setPendingFile(null); setCtxMenu(null); setMediaView(null); }, [chat.id]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (mediaView) setMediaView(null);
                else if (ctxMenu) setCtxMenu(null);
                else if (editingMsg) { setEditingMsg(null); setInputText(''); }
                else if (replyTo) setReplyTo(null);
                else if (pendingFile) setPendingFile(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [ctxMenu, editingMsg, replyTo, pendingFile, mediaView]);

    const handleSend = useCallback(async () => {
        if (sending) return;

        if (editingMsg) {
            const t = inputText.trim();
            if (t && t !== editingMsg.content) onEditMessage(editingMsg.id, t);
            setEditingMsg(null); setInputText('');
            return;
        }

        if (pendingFile) {
            setSending(true);
            try {
                await onSendFile(chat.id, pendingFile, inputText.trim(), replyTo?.id);
                setPendingFile(null); setReplyTo(null); setInputText('');
            } catch (e: any) {
                showToast(e.message || 'Ошибка отправки файла', 'error');
            } finally {
                setSending(false);
            }
            return;
        }

        const t = inputText.trim();
        if (!t) return;
        onSendMessage(t, replyTo?.id);
        setReplyTo(null); setInputText('');
    }, [inputText, editingMsg, pendingFile, replyTo, chat.id, sending, onSendMessage, onEditMessage, onSendFile, showToast]);

    const handleSendVoice = useCallback((blob: Blob) => { onSendVoice(chat.id, blob); }, [chat.id, onSendVoice]);
    const handleSendFile = useCallback((file: File) => { setPendingFile(file); }, []);

    const handleContextMenu = (e: React.MouseEvent, msg: LocalMessage) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY, message: msg });
    };

    const ctxItems = (msg: LocalMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [];
        items.push({ label: 'Ответить', icon: Icon.reply(16), onClick: () => { setReplyTo(msg); setEditingMsg(null); } });
        items.push({ label: 'Переслать', icon: Icon.forward(16), onClick: () => onForwardMessage(msg) });
        if (msg.own && msg.status !== 'pending' && !msg.attachment) {
            items.push({ label: 'Редактировать', icon: Icon.edit(16), onClick: () => { setEditingMsg(msg); setInputText(msg.content); setReplyTo(null); } });
        }
        items.push({ label: 'Копировать', icon: Icon.copy(16), onClick: () => { navigator.clipboard.writeText(msg.content); showToast('Скопировано'); } });
        if (msg.own) items.push({ label: 'Удалить', icon: Icon.trash(16), danger: true, onClick: () => onDeleteMessage(msg.id) });
        return items;
    };

    const handleRefresh = useCallback(() => { onRefreshChat(chat.id); }, [onRefreshChat, chat.id]);
    const handleCall = useCallback(() => {
        if (chat.is_group) { showToast('Групповые звонки пока не поддерживаются', 'info'); return; }
        onStartCall(chat.id);
    }, [chat.id, chat.is_group, onStartCall, showToast]);
    const handleAuthorClick = useCallback((userId: string) => { if (onOpenProfile) onOpenProfile(userId); }, [onOpenProfile]);

    const handleClickReply = useCallback((messageId: string) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('msg-highlight'); setTimeout(() => el.classList.remove('msg-highlight'), 1500); }
    }, []);

    const handleOpenMedia = useCallback((info: MediaInfo) => { setMediaView(info); }, []);

    return (
        <section className="chat-view">
            <div className="chat-header">
                <div className="chat-header-left" style={{ cursor: !chat.is_group ? 'pointer' : undefined }} onClick={handleHeaderAvatarClick}>
                    <Avatar name={chat.name} size={38} online={chat.is_group ? undefined : chat.online} avatarUrl={getChatAvatar()} />
                    <div className="chat-header-info">
                        <h3>{chat.name}</h3>
                        <span className="chat-header-sub">
                            {chat.is_group ? `${chat.members.length} участников` : chat.online ? 'в сети' : 'был(а) недавно'}
                        </span>
                    </div>
                </div>
                <div className="chat-header-actions">
                    <button className="icon-btn" title="Позвонить" onClick={handleCall}>{Icon.phone(20)}</button>
                    <button className="icon-btn" title="Поиск">{Icon.search(20)}</button>
                </div>
            </div>

            <ChatSecurityBanner chat={chat} currentUserId={currentUserId} onRefresh={handleRefresh} showToast={showToast} />

            <div className="messages-scroll">
                <div className="messages-inner">
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
                                onOpenMedia={handleOpenMedia} />
                        );
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            <InputBar
                value={inputText} onChange={setInputText}
                onSend={handleSend} onSendVoice={handleSendVoice} onSendFile={handleSendFile}
                editingMessage={editingMsg ? { id: editingMsg.id, text: editingMsg.content, author: editingMsg.sender_name, time: formatTime(editingMsg.created_at), own: editingMsg.own } : null}
                onCancelEdit={() => { setEditingMsg(null); setInputText(''); }}
                replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
                pendingFile={pendingFile} onCancelFile={() => setPendingFile(null)} />

            {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems(ctxMenu.message)} onClose={() => setCtxMenu(null)} />}

            {mediaView && <MediaViewer {...mediaView} onClose={() => setMediaView(null)} />}
        </section>
    );
}