import React from 'react';
import type { Tab, UserDto, NotificationData } from './types';
import { useAuth } from './hooks/useAuth';
import { useChats } from './hooks/useChats';
import { useCall } from './hooks/useCall';
import { useToast } from './hooks/useToast';
import { cryptoManager } from './crypto';
import {
    initNotifications,
    playNotificationSound,
    sendSystemNotification,
    showCallNotification,
} from './notifications';
import './App.css';

import { ToastContainer } from './components/ui/Toast';
import { NotificationContainer } from './components/ui/Notification';
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

const MAX_NOTIFICATIONS = 4;
const NOTIFICATION_DURATION = 5000;

export default function App() {
    const [tab, setTab] = React.useState<Tab>('chats');
    const [dark, setDark] = React.useState(loadDark);
    const [search, setSearch] = React.useState('');
    const [newChatOpen, setNewChatOpen] = React.useState(false);
    const [notifications, setNotifications] = React.useState<NotificationData[]>([]);
    const { toasts, showToast } = useToast();

    const { user, setUser, loading: authLoading, login, register, logout } = useAuth();

    // ── Инициализация уведомлений ─────────────────────────

    React.useEffect(() => {
        if (!user) return;
        initNotifications();
    }, [user]);

    // ── Ref для selectChat ───────────────────────────────

    const selectChatRef = React.useRef<(id: string) => void>(() => { });

    // ── Dismiss notification ─────────────────────────────

    const dismissNotification = React.useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // ── Клик по уведомлению ──────────────────────────────

    const handleNotifClick = React.useCallback((chatId: string) => {
        setTab('chats');
        selectChatRef.current(chatId);
        // Удаляем все уведомления этого чата
        setNotifications(prev => prev.filter(n => n.chatId !== chatId));
    }, []);

    // ── Обработчик нового сообщения ──────────────────────

    const handleNewMessage = React.useCallback((data: NotificationData) => {
        // 1. ВСЕГДА звук
        playNotificationSound();

        // 2. ВСЕГДА in-app уведомление (плашка в правом нижнем углу)
        setNotifications(prev => {
            const next = [...prev, data];
            // Максимум 4, убираем старые
            return next.slice(-MAX_NOTIFICATIONS);
        });

        // Автоудаление через 5 сек
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== data.id));
        }, NOTIFICATION_DURATION);

        // 3. Системное уведомление (если окно не в фокусе)
        if (document.hidden || !document.hasFocus()) {
            const title = data.isGroup ? data.chatName : data.senderName;
            const body = data.isGroup ? `${data.senderName}: ${data.text}` : data.text;
            sendSystemNotification(
                title,
                body.length > 100 ? body.slice(0, 100) + '…' : body,
                `msg-${data.chatId}`,
                () => handleNotifClick(data.chatId),
            );
        }
    }, [handleNotifClick]);

    // ── Хуки ─────────────────────────────────────────────

    const {
        chats, selectedId, selectedChat,
        loadingChats, loadingMessages,
        selectChat, sendMessage, sendVoiceMessage,
        editMessage, deleteMessage, createChat, refreshChat,
    } = useChats(user, handleNewMessage);

    selectChatRef.current = selectChat;

    const {
        callState, startCall, answerCall, rejectCall,
        hangup, toggleMute, setPeerVolume, setMicGain, dismissCall,
        toggleMediaPanel, shareMedia, removeMedia, controlMedia,
        setMediaVolume, toggleMediaMute, updateMediaTitle, updateMediaTime,
    } = useCall(user?.id || '', chats);

    // ── Уведомление о звонке ─────────────────────────────

    React.useEffect(() => {
        if (callState.status === 'ringing' && callState.peerName) {
            if (document.hidden || !document.hasFocus()) {
                showCallNotification(callState.peerName);
            }
        }
    }, [callState.status, callState.peerName]);

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
                    <SettingsView
                        darkMode={dark} onToggleTheme={toggleDark} showToast={showToast}
                        user={user} onUserUpdate={handleUserUpdate}
                    />
                )}
            </div>

            <NewChatModal open={newChatOpen} onClose={() => setNewChatOpen(false)} onCreate={createChat} showToast={showToast} />
            <IncomingCallModal callState={callState} onAccept={answerCall} onReject={rejectCall} />
            <CallOverlay
                callState={callState}
                currentUserId={user.id}
                onHangup={hangup}
                onToggleMute={toggleMute}
                onSetPeerVolume={setPeerVolume}
                onSetMicGain={setMicGain}
                onDismiss={dismissCall}
                onToggleMediaPanel={toggleMediaPanel}
                onShareMedia={shareMedia}
                onRemoveMedia={removeMedia}
                onControlMedia={controlMedia}
                onMediaVolumeChange={setMediaVolume}
                onMediaMuteToggle={toggleMediaMute}
                onMediaTitleUpdate={updateMediaTitle}
                onMediaTimeUpdate={updateMediaTime}
                showToast={showToast}
            />

            {/* In-app уведомления — ВСЕГДА видны */}
            <NotificationContainer
                notifications={notifications}
                onClickNotification={handleNotifClick}
                onDismiss={dismissNotification}
            />

            <ToastContainer toasts={toasts} />
        </div>
    );
}