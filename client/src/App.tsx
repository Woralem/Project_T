import React from 'react';
import type { Tab, UserDto, NotificationData } from './types';
import { useAuth } from './hooks/useAuth';
import { useChats } from './hooks/useChats';
import { useCall } from './hooks/useCall';
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
import { CallOverlay } from './components/calls/CallOverlay';
import { IncomingCallModal } from './components/calls/IncomingCallModal';
import { SettingsView } from './components/settings/SettingsView';

function loadDark(): boolean {
    try { return localStorage.getItem('dark_mode') !== 'false'; } catch { return true; }
}
function saveDark(v: boolean) {
    try { localStorage.setItem('dark_mode', String(v)); } catch { /* */ }
}

// ── Звук уведомления ─────────────────────────────────────

let lastNotifSoundTime = 0;
function playNotificationSound() {
    const now = Date.now();
    if (now - lastNotifSoundTime < 1500) return;
    lastNotifSoundTime = now;
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => { });
}

// ── Десктопное уведомление ───────────────────────────────

function showDesktopNotification(
    data: NotificationData,
    onClick: () => void,
) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = data.isGroup ? data.chatName : data.senderName;
    const body = data.isGroup ? `${data.senderName}: ${data.text}` : data.text;

    let icon: string | undefined;
    if (data.senderAvatarUrl) {
        icon = data.senderAvatarUrl.startsWith('http')
            ? data.senderAvatarUrl
            : `http://163.5.180.138:3000${data.senderAvatarUrl}`;
    }

    try {
        const n = new Notification(title, {
            body: body.length > 100 ? body.slice(0, 100) + '…' : body,
            icon,
            silent: true,
            tag: `msg-${data.chatId}`,
        });

        n.onclick = () => {
            window.focus();
            onClick();
            n.close();
        };

        setTimeout(() => n.close(), 6000);
    } catch (e) {
        console.warn('[Notification] Failed:', e);
    }
}

// ══════════════════════════════════════════════════════════

export default function App() {
    const [tab, setTab] = React.useState<Tab>('chats');
    const [dark, setDark] = React.useState(loadDark);
    const [search, setSearch] = React.useState('');
    const [newChatOpen, setNewChatOpen] = React.useState(false);
    const { toasts, showToast } = useToast();

    const { user, setUser, loading: authLoading, login, register, logout } = useAuth();

    // ── Запросить разрешение на уведомления ───────────────

    React.useEffect(() => {
        if (user && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(p => {
                console.log('[Notification] Permission:', p);
            });
        }
    }, [user]);

    // ── Колбэк для нового сообщения ──────────────────────

    const selectChatRef = React.useRef<(id: string) => void>(() => { });

    const handleNewMessage = React.useCallback((data: NotificationData) => {
        playNotificationSound();
        showDesktopNotification(data, () => {
            setTab('chats');
            selectChatRef.current(data.chatId);
        });
    }, []);

    // ── Хуки ─────────────────────────────────────────────

    const {
        chats, selectedId, selectedChat,
        loadingChats, loadingMessages,
        selectChat, sendMessage, sendVoiceMessage,
        editMessage, deleteMessage, createChat, refreshChat,
    } = useChats(user, handleNewMessage);

    // Обновляем ref после создания selectChat
    selectChatRef.current = selectChat;

    const {
        callState, startCall, answerCall, rejectCall,
        hangup, toggleMute, setPeerVolume, setMicGain, dismissCall,
    } = useCall(user?.id || '', chats);

    React.useEffect(() => {
        cryptoManager.initialize().then(keys => {
            if (keys) console.log('[E2E] Keys loaded from storage');
        }).catch(e => console.warn('[E2E] Init failed:', e));
    }, []);

    const toggleDark = React.useCallback(() => {
        setDark(d => { const next = !d; saveDark(next); return next; });
    }, []);

    const handleLogout = React.useCallback(() => {
        if (callState.status !== 'idle' && callState.status !== 'ended') hangup();
        cryptoManager.clear();
        logout();
    }, [logout, callState.status, hangup]);

    const handleUserUpdate = React.useCallback((updated: UserDto) => {
        setUser(updated);
    }, [setUser]);

    const handleStartCall = React.useCallback((chatId: string) => {
        if (callState.status !== 'idle') {
            showToast('Вы уже в звонке', 'error');
            return;
        }
        startCall(chatId);
    }, [callState.status, startCall, showToast]);

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
                <NavRail tab={tab} onTab={setTab} darkMode={dark} onToggleTheme={toggleDark} onLogout={handleLogout} />

                {tab === 'chats' && (
                    <>
                        <ChatListPanel
                            chats={chats} selectedId={selectedId} onSelect={selectChat}
                            search={search} onSearch={setSearch}
                            onNewChat={() => setNewChatOpen(true)}
                            loading={loadingChats} currentUserId={user.id}
                        />
                        {selectedChat ? (
                            <ChatView
                                chat={selectedChat} currentUserId={user.id}
                                loadingMessages={loadingMessages}
                                onSendMessage={sendMessage} onSendVoice={sendVoiceMessage}
                                onDeleteMessage={deleteMessage} onEditMessage={editMessage}
                                onRefreshChat={refreshChat} onStartCall={handleStartCall}
                                showToast={showToast}
                            />
                        ) : (
                            <EmptyState />
                        )}
                    </>
                )}
                {tab === 'calls' && <CallsView />}
                {tab === 'settings' && (
                    <SettingsView darkMode={dark} onToggleTheme={toggleDark} showToast={showToast} user={user} onUserUpdate={handleUserUpdate} />
                )}
            </div>

            <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} onCreate={createChat} showToast={showToast} />

            <IncomingCallModal callState={callState} onAccept={answerCall} onReject={rejectCall} />

            <CallOverlay
                callState={callState}
                onHangup={hangup}
                onToggleMute={toggleMute}
                onSetPeerVolume={setPeerVolume}
                onSetMicGain={setMicGain}
                onDismiss={dismissCall}
            />

            <ToastContainer toasts={toasts} />
        </div>
    );
}