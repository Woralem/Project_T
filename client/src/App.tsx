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
import { ProfileModal } from './components/ui/ProfileModal';

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
    const [profileUserId, setProfileUserId] = React.useState<string | null>(null);
    const { toasts, showToast } = useToast();

    const { user, setUser, loading: authLoading, login, register, logout } = useAuth();

    React.useEffect(() => {
        if (!user) return;
        initNotifications();
    }, [user]);

    const selectChatRef = React.useRef<(id: string) => void>(() => { });

    const dismissNotification = React.useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const handleNotifClick = React.useCallback((chatId: string) => {
        setTab('chats');
        selectChatRef.current(chatId);
        setNotifications(prev => prev.filter(n => n.chatId !== chatId));
    }, []);

    const handleNewMessage = React.useCallback((data: NotificationData) => {
        playNotificationSound();
        setNotifications(prev => {
            const next = [...prev, data];
            return next.slice(-MAX_NOTIFICATIONS);
        });
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== data.id));
        }, NOTIFICATION_DURATION);
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

    // ── Profile handlers ─────────────────────────────────

    const handleOpenProfile = React.useCallback((userId: string) => {
        setProfileUserId(userId);
    }, []);

    const handleProfileMessage = React.useCallback(async (userId: string) => {
        setProfileUserId(null);
        setTab('chats');

        // Ищем существующий DM
        const dm = chats.find(c => !c.is_group && c.members.some(m => m.user_id === userId));
        if (dm) {
            selectChat(dm.id);
        } else {
            try {
                await createChat([userId], false);
            } catch (e: any) {
                showToast(e.message || 'Ошибка создания чата', 'error');
            }
        }
    }, [chats, selectChat, createChat, showToast]);

    const handleProfileCall = React.useCallback((userId: string) => {
        setProfileUserId(null);
        const dm = chats.find(c => !c.is_group && c.members.some(m => m.user_id === userId));
        if (dm) {
            handleStartCall(dm.id);
        } else {
            showToast('Сначала начните чат с пользователем', 'info');
        }
    }, [chats, handleStartCall, showToast]);

    const handleProfileEdit = React.useCallback(() => {
        setProfileUserId(null);
        setTab('settings');
    }, []);

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
                                onOpenProfile={handleOpenProfile}
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

            {/* Profile Modal */}
            {profileUserId && (
                <ProfileModal
                    userId={profileUserId}
                    currentUserId={user.id}
                    onClose={() => setProfileUserId(null)}
                    onMessage={handleProfileMessage}
                    onCall={handleProfileCall}
                    onEdit={handleProfileEdit}
                />
            )}

            <NotificationContainer
                notifications={notifications}
                onClickNotification={handleNotifClick}
                onDismiss={dismissNotification}
            />

            <ToastContainer toasts={toasts} />
        </div>
    );
}