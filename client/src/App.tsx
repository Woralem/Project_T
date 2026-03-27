import React from 'react';
import type { Tab } from './types';
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

function loadDark(): boolean {
    try { return localStorage.getItem('dark_mode') !== 'false'; } catch { return true; }
}
function saveDark(v: boolean) {
    try { localStorage.setItem('dark_mode', String(v)); } catch { /* */ }
}

export default function App() {
    const [tab, setTab] = React.useState<Tab>('chats');
    const [dark, setDark] = React.useState(loadDark);
    const [search, setSearch] = React.useState('');
    const [newChatOpen, setNewChatOpen] = React.useState(false);
    const { toasts, showToast } = useToast();

    const { user, loading: authLoading, login, register, logout } = useAuth();
    const {
        chats, selectedId, selectedChat,
        loadingChats, loadingMessages,
        selectChat, sendMessage, sendVoiceMessage,
        editMessage, deleteMessage, createChat,
    } = useChats(user);

    const toggleDark = React.useCallback(() => {
        setDark(d => {
            const next = !d;
            saveDark(next);
            return next;
        });
    }, []);

    const theme = dark ? 'dark' : 'light';

    // Загрузка
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

    // Авторизация
    if (!user) {
        return (
            <div className={`root ${theme}`}>
                <AuthScreen onLogin={login} onRegister={register} />
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
                    onToggleTheme={toggleDark}
                    onLogout={logout}
                />

                {tab === 'chats' && (
                    <>
                        <ChatListPanel
                            chats={chats}
                            selectedId={selectedId}
                            onSelect={selectChat}
                            search={search}
                            onSearch={setSearch}
                            onNewChat={() => setNewChatOpen(true)}
                            loading={loadingChats}
                        />
                        {selectedChat ? (
                            <ChatView
                                chat={selectedChat}
                                loadingMessages={loadingMessages}
                                onSendMessage={sendMessage}
                                onSendVoice={sendVoiceMessage}
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
                        onToggleTheme={toggleDark}
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