import React, { useEffect, useRef, useState } from 'react';
import { Phone, Info, Lock, Shield, Clock, Edit2, Reply, Copy, Trash2, AlertTriangle, Share2 } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { useUiStore } from '../../store/useUiStore';
import { Avatar } from '../ui/Avatar';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';
import { ContextMenu } from '../ui/ContextMenu';
import { ChatInfoPanel } from './ChatInfoPanel';
import { UserProfilePanel } from './UserProfilePanel';
import { ForwardModal } from './ForwardModal';
import type { LocalMessage, E2EStatus } from '../../types';
import type { ContextMenuItem } from '../ui/ContextMenu';
import { useCallStore } from '../../store/useCallStore';

interface Props { currentUserId: string; currentUserName: string }

function E2EBanner({ status }: { status?: E2EStatus }) {
    if (!status) return null;
    const cfg: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
        ready: { bg: 'bg-green-500/10 text-green-600 dark:text-green-400', icon: <Lock size={14} />, label: 'Сквозное шифрование включено' },
        no_identity: { bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: <AlertTriangle size={14} />, label: 'Настройте E2E в настройках' },
        peer_no_e2e: { bg: 'bg-gray-200/60 dark:bg-gray-800/60 text-gray-500', icon: <Shield size={14} />, label: 'Собеседник не настроил E2E' },
        waiting: { bg: 'bg-blue-500/10 text-blue-500', icon: <Clock size={14} />, label: 'Синхронизация ключей...' },
        error: { bg: 'bg-red-500/10 text-red-500', icon: <AlertTriangle size={14} />, label: 'Ошибка шифрования' },
    };
    const c = cfg[status]; if (!c) return null;
    return <div className={`flex items-center justify-center gap-2 mb-4 px-4 py-2 text-xs font-semibold rounded-2xl w-fit mx-auto select-none ${c.bg}`}>{c.icon} {c.label}</div>;
}

export function ChatView({ currentUserId, currentUserName }: Props) {
    const { chats, selectedId, loadingMessages, sendMessage, deleteMessage, editMessage, forwardMessage } = useChatStore();
    const showToast = useUiStore(s => s.showToast);
    const [panelOpen, setPanelOpen] = useState(false);
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; message: LocalMessage } | null>(null);
    const [editingMsg, setEditingMsg] = useState<LocalMessage | null>(null);
    const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
    const [forwardMsg, setForwardMsg] = useState<LocalMessage | null>(null);
    const chat = chats.find(c => c.id === selectedId);
    const bottomRef = useRef<HTMLDivElement>(null);
    const startCall = useCallStore(s => s.startCall);
    const allChats = useChatStore(s => s.chats);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.messages.length, chat?.id]);
    useEffect(() => { setPanelOpen(false); setEditingMsg(null); setCtxMenu(null); setReplyTo(null); setForwardMsg(null); }, [selectedId]);

    if (!chat) return null;

    const other = chat.members.find(m => m.user_id !== currentUserId);
    const isDM = !chat.is_group && !chat.isChannel;

    const getCtxItems = (msg: LocalMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [
            { label: 'Ответить', icon: <Reply size={16} />, onClick: () => setReplyTo(msg) },
            { label: 'Переслать', icon: <Share2 size={16} />, onClick: () => setForwardMsg(msg) },
            { label: 'Копировать', icon: <Copy size={16} />, onClick: () => { navigator.clipboard.writeText(msg.decrypted_content || msg.content); showToast('Скопировано'); } },
        ];
        if (msg.own && msg.status !== 'pending') {
            items.push({ label: 'Редактировать', icon: <Edit2 size={16} />, onClick: () => { setEditingMsg(msg); setReplyTo(null); } });
            items.push({ label: 'Удалить', icon: <Trash2 size={16} />, danger: true, onClick: () => deleteMessage(msg.id) });
        }
        return items;
    };

    const handleSend = (text: string, attachmentId?: string, fileNonce?: string) => {
        if (editingMsg) { editMessage(editingMsg.id, text); setEditingMsg(null); return; }
        sendMessage(chat.id, text, currentUserId, currentUserName, attachmentId, fileNonce, replyTo?.id);
        setReplyTo(null);
    };

    const handleForward = (msg: LocalMessage, targetChatId: string) => {
        forwardMessage(msg, targetChatId, currentUserId, currentUserName);
        showToast('Сообщение переслано', 'success');
    };

    // Prevent left-click from stealing input focus (Telegram-like behavior)
    const handleMessageAreaMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) {
            const target = e.target as HTMLElement;
            if (!target.closest('button, a, input, textarea, video, audio, [role="button"], img')) {
                e.preventDefault();
            }
        }
    };

    const subtitle = chat.isChannel ? `${chat.members.length} подписчиков` : chat.is_group ? `${chat.members.length} участников` : other?.online ? 'в сети' : 'был(а) недавно';

    return (
        <section className="flex flex-1 overflow-hidden relative bg-gray-50 dark:bg-[#0c0c10]">
            <div className="flex flex-col flex-1 min-w-0 h-full">
                <header className="flex justify-between items-center px-5 py-3 bg-white dark:bg-[#15151c] border-b border-gray-200 dark:border-gray-800 shadow-sm z-10 flex-shrink-0">
                    <div className="flex items-center gap-3 cursor-pointer select-none min-w-0" onClick={() => setPanelOpen(v => !v)}>
                        <Avatar name={chat.name} size={40} online={isDM ? other?.online : undefined} avatarUrl={isDM ? other?.avatar_url : undefined} />
                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-[15px] leading-tight truncate">{chat.isChannel ? '📢 ' : ''}{chat.name}</h3>
                                {chat.e2eStatus === 'ready' && <Lock size={12} className="text-green-500 flex-shrink-0" />}
                            </div>
                            <span className="text-xs text-gray-500">{subtitle}</span>
                        </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                        {isDM && (
                            <button className="p-2 text-gray-500 hover:text-accent hover:bg-accent/10 rounded-xl transition active:scale-95" title="Позвонить" onClick={() => startCall(chat.id, allChats, currentUserId)}>
                                <Phone size={20} />
                            </button>
                        )}
                        <button className={`p-2 rounded-xl transition active:scale-95 ${panelOpen ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:text-accent hover:bg-accent/10'}`} onClick={() => setPanelOpen(v => !v)}><Info size={20} /></button>
                    </div>
                </header>

                <div
                    className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 custom-scrollbar"
                    onMouseDown={handleMessageAreaMouseDown}
                    onClick={() => setCtxMenu(null)}
                >
                    <div className="flex flex-col justify-end min-h-full w-full">
                        <E2EBanner status={chat.e2eStatus} />
                        {loadingMessages && !chat.messages.length && (
                            <div className="flex flex-col items-center gap-3 py-8">
                                <div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}</div>
                                <p className="text-gray-400 text-[13px]">Загрузка сообщений...</p>
                            </div>
                        )}
                        {!loadingMessages && chat.messagesLoaded && !chat.messages.length && <p className="text-center text-gray-400 text-[13px] py-4">Нет сообщений. Напишите первое!</p>}

                        {chat.messages.map((msg, i) => {
                            const prev = chat.messages[i - 1];
                            const isFirst = !prev || prev.own !== msg.own || prev.sender_id !== msg.sender_id;
                            return (
                                <div key={msg.id} className={`w-full flex ${msg.own ? 'justify-end' : 'justify-start'} ${isFirst ? 'mt-2.5' : 'mt-0.5'}`} onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, message: msg }); }}>
                                    <MessageBubble message={msg} isFirst={isFirst} isGroup={chat.is_group || chat.isChannel} onReply={setReplyTo} />
                                </div>
                            );
                        })}
                        <div ref={bottomRef} className="h-2" />
                    </div>
                </div>

                <div className="px-4 pb-3 flex-shrink-0">
                    <div className="rounded-2xl overflow-hidden shadow-[0_2px_15px_rgba(0,0,0,0.04)] dark:shadow-none border border-gray-200 dark:border-gray-800">
                        <InputBar
                            chatId={chat.id}
                            onSend={handleSend}
                            editingText={editingMsg?.content}
                            onCancelEdit={() => setEditingMsg(null)}
                            replyTo={replyTo ? { sender_name: replyTo.sender_name, content: replyTo.decrypted_content || replyTo.content, attachment: replyTo.attachment } : null}
                            onCancelReply={() => setReplyTo(null)}
                        />
                    </div>
                </div>
            </div>

            {panelOpen && (
                <>
                    <div className="absolute inset-0 z-20 bg-black/10 dark:bg-black/30" onClick={() => setPanelOpen(false)} />
                    <div className="absolute right-0 top-0 bottom-0 z-30">
                        {isDM && other ? <UserProfilePanel member={other} onClose={() => setPanelOpen(false)} /> : <ChatInfoPanel chat={chat} currentUserId={currentUserId} onClose={() => setPanelOpen(false)} />}
                    </div>
                </>
            )}

            {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={getCtxItems(ctxMenu.message)} onClose={() => setCtxMenu(null)} />}

            <ForwardModal
                open={!!forwardMsg}
                message={forwardMsg}
                chats={chats}
                currentUserId={currentUserId}
                onForward={handleForward}
                onClose={() => setForwardMsg(null)}
            />
        </section>
    );
}