import React, { useState, useCallback } from 'react';
import type { View, Tab, Chat, ToastData } from './types';
import { uid, getNow } from './utils';
import { MOCK_CHATS } from './data';
import './App.css';

import { ToastContainer } from './components/ui/Toast';
import { AuthScreen } from './components/auth/AuthScreen';
import { NavRail } from './components/nav/NavRail';
import { ChatListPanel } from './components/chat/ChatListPanel';
import { ChatView } from './components/chat/ChatView';
import { EmptyState } from './components/chat/EmptyState';
import { NewChatModal } from './components/chat/NewChatModal';
import { CallsView } from './components/calls/CallsView';
import { SettingsView } from './components/settings/SettingsView';

export default function App() {
    /* ── Глобальный стейт ─────────────────────── */
    const [view, setView] = useState<View>('auth');
    const [tab, setTab] = useState<Tab>('chats');
    const [dark, setDark] = useState(true);
    const [chats, setChats] = useState<Chat[]>(MOCK_CHATS);
    const [selId, setSelId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const selChat = chats.find(c => c.id === selId) ?? null;

    /* ── Тосты ────────────────────────────────── */
    const showToast = useCallback((text: string, type: ToastData['type'] = 'info') => {
        const id = uid();
        setToasts(prev => [...prev, { id, text, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    /* ── Выбор чата (сброс непрочитанных) ─────── */
    const selectChat = useCallback((id: string) => {
        setSelId(id);
        setChats(prev => prev.map(c =>
            c.id === id ? { ...c, unread: 0 } : c
        ));
    }, []);

    /* ── Отправка ─────────────────────────────── */
    const sendMessage = useCallback((text: string) => {
        if (!selId) return;
        setChats(prev => prev.map(c =>
            c.id !== selId ? c : {
                ...c,
                messages: [...c.messages, {
                    id: uid(), author: 'Ты', text, time: getNow(), own: true, status: 'sent' as const,
                }],
            }
        ));
    }, [selId]);

    /* ── Удаление сообщения ───────────────────── */
    const deleteMessage = useCallback((msgId: string) => {
        if (!selId) return;
        setChats(prev => prev.map(c =>
            c.id !== selId ? c : {
                ...c,
                messages: c.messages.filter(m => m.id !== msgId),
            }
        ));
        showToast('Сообщение удалено');
    }, [selId, showToast]);

    /* ── Редактирование сообщения ─────────────── */
    const editMessage = useCallback((msgId: string, newText: string) => {
        if (!selId) return;
        setChats(prev => prev.map(c =>
            c.id !== selId ? c : {
                ...c,
                messages: c.messages.map(m =>
                    m.id !== msgId ? m : { ...m, text: newText, edited: true }
                ),
            }
        ));
        showToast('Сообщение отредактировано');
    }, [selId, showToast]);

    /* ── Создание нового чата ─────────────────── */
    const createChat = useCallback((name: string) => {
        const newChat: Chat = {
            id: uid(), name, group: false, online: false, unread: 0, messages: [],
        };
        setChats(prev => [newChat, ...prev]);
        setSelId(newChat.id);
        showToast(`Чат с ${name} создан`);
    }, [showToast]);

    /* ── Рендер ───────────────────────────────── */
    const theme = dark ? 'dark' : 'light';

    if (view === 'auth') {
        return (
            <div className={`root ${theme}`}>
                <AuthScreen onLogin={() => setView('main')} />
                <ToastContainer toasts={toasts} />
            </div>
        );
    }

    return (
        <div className={`root ${theme}`}>
            <div className="layout">
                <NavRail
                    tab={tab}
                    onTab={setTab}
                    darkMode={dark}
                    onToggleTheme={() => setDark(d => !d)}
                    onLogout={() => setView('auth')}
                />

                {tab === 'chats' && (
                    <>
                        <ChatListPanel
                            chats={chats}
                            selectedId={selId}
                            onSelect={selectChat}
                            search={search}
                            onSearch={setSearch}
                            onNewChat={() => setNewChatOpen(true)}
                        />
                        {selChat ? (
                            <ChatView
                                chat={selChat}
                                onSendMessage={sendMessage}
                                onDeleteMessage={deleteMessage}
                                onEditMessage={editMessage}
                                showToast={showToast}
                            />
                        ) : (
                            <EmptyState />
                        )}
                    </>
                )}

                {tab === 'calls' && <CallsView />}
                {tab === 'settings' && (
                    <SettingsView
                        darkMode={dark}
                        onToggleTheme={() => setDark(d => !d)}
                        showToast={showToast}
                    />
                )}
            </div>

            <NewChatModal
                open={newChatOpen}
                onClose={() => setNewChatOpen(false)}
                onCreate={createChat}
            />
            <ToastContainer toasts={toasts} />
        </div>
    );
}   