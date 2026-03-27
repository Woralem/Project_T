import React from 'react';
import type { View, Tab } from './types';
import { useAuth } from './hooks/useAuth';
import { useChats } from './hooks/useChats';
import { useToast } from './hooks/useToast';
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
    const [tab, setTab] = React.useState<Tab>('chats');
    const [dark, setDark] = React.useState(true);
    const [search, setSearch] = React.useState('');
    const [newChatOpen, setNewChatOpen] = React.useState(false);
    const { toasts, showToast } = useToast();

    const { user, loading: authLoading, login, register, logout } = useAuth();
    const {
        chats, selectedId, selectedChat,
        selectChat, sendMessage, editMessage, deleteMessage,
        createChat,
    } = useChats(user);

    const theme = dark ? 'dark' : 'light';

    // Экран загрузки
    if (authLoading) {
        return (
            <div className={`root ${theme}`}>
                <div className="auth-screen">
                    <div className="auth-card" style={{ textAlign: 'center', padding: 40 }}>
                        <p>Загрузка...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Экран авторизации
    if (!user) {
        return (
            <div className={`root ${theme}`}>
                <AuthScreen
                    onLogin={login}
                    onRegister={register}
                />
                <ToastContainer toasts={toasts} />
            </div>
        );
    }

    // Основное приложение
    return (
        <div className={`root ${theme}`}>
            <div className="layout">
                <NavRail
                    tab={tab}
                    onTab={setTab}
                    darkMode={dark}
                    onToggleTheme={() => setDark(d => !d)}
                    onLogout={logout}
                />

                {tab === 'chats' && (
                    <>
                        <ChatListPanel
                            chats={chats.map(c => ({
                                id: c.id,
                                name: c.name,
                                group: c.is_group,
                                online: c.online,
                                messages: c.messages.map(m => ({
                                    id: m.id,
                                    author: m.sender_name,
                                    text: m.content,
                                    time: new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
                                    own: m.own,
                                    status: m.status === 'pending' ? 'sent' as const : 'delivered' as const,
                                })),
                                unread: c.unread_count,
                            }))}
                            selectedId={selectedId}
                            onSelect={selectChat}
                            search={search}
                            onSearch={setSearch}
                            onNewChat={() => setNewChatOpen(true)}
                        />
                        {selectedChat ? (
                            <ChatView
                                chat={{
                                    id: selectedChat.id,
                                    name: selectedChat.name,
                                    group: selectedChat.is_group,
                                    online: selectedChat.online,
                                    messages: selectedChat.messages.map(m => ({
                                        id: m.id,
                                        author: m.sender_name,
                                        text: m.content,
                                        time: new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }),
                                        own: m.own,
                                        status: m.status === 'pending' ? 'sent' as const : m.status,
                                        edited: m.edited,
                                    })),
                                    unread: selectedChat.unread_count,
                                }}
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
                        user={user}
                    />
                )}
            </div>

            <NewChatModal
                open={newChatOpen}
                onClose={() => setNewChatOpen(false)}
                onCreate={createChat}
                showToast={showToast}
            />
            <ToastContainer toasts={toasts} />
        </div>
    );
}