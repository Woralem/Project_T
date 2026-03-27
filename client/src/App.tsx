import React from 'react';
import type { Tab, UserDto } from './types';
import { useAuth } from './hooks/useAuth';
import { useChats } from './hooks/useChats';
import { useToast } from './hooks/useToast';
import { cryptoManager } from './crypto';
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

    const { user, setUser, loading: authLoading, login, register, logout } = useAuth();
    const {
        chats, selectedId, selectedChat,
        loadingChats, loadingMessages,
        selectChat, sendMessage, sendVoiceMessage,
        editMessage, deleteMessage, createChat,
    } = useChats(user);

    React.useEffect(() => {
        cryptoManager.initialize().then(keys => {
            if (keys) console.log('[E2E] Keys loaded from storage');
        }).catch(e => console.warn('[E2E] Init failed:', e));
    }, []);

    const toggleDark = React.useCallback(() => {
        setDark(d => {
            const next = !d;
            saveDark(next);
            return next;
        });
    }, []);

    const handleLogout = React.useCallback(() => {
        cryptoManager.clear();
        logout();
    }, [logout]);

    const handleUserUpdate = React.useCallback((updated: UserDto) => {
        setUser(updated);
    }, [setUser]);

    const theme = dark ? 'dark' : 'light';

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

    if (!user) {
        return (
            <div className={`root ${theme}`}>
                <AuthScreen onLogin={login} onRegister={register} />
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
                    onToggleTheme={toggleDark}
                    onLogout={handleLogout}
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
                            currentUserId={user.id}
                        />
                        {selectedChat ? (
                            <ChatView
                                chat={selectedChat}
                                currentUserId={user.id}
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
                        onUserUpdate={handleUserUpdate}
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