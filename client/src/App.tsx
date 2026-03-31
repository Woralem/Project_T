import React, { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useUiStore } from './store/useUiStore';
import { useChatStore } from './store/useChatStore';
import { useCallStore } from './store/useCallStore';
import { AuthScreen } from './components/auth/AuthScreen';
import { NavRail } from './components/nav/NavRail';
import { ChatListPanel } from './components/chat/ChatListPanel';
import { ChatView } from './components/chat/ChatView';
import { SettingsView } from './components/settings/SettingsView';
import { GlobalAudioPlayer } from './components/ui/GlobalAudioPlayer';
import { CallOverlay } from './components/calls/CallOverlay';
import { IncomingCallModal } from './components/calls/IncomingCallModal';
import { wsManager } from './websocket';
import { MessageCircle } from 'lucide-react';

const CALL_EVENTS = new Set([
    'call_incoming', 'call_accepted', 'call_ice', 'call_rejected',
    'call_ended', 'call_mute_changed', 'call_media_shared', 'call_media_removed',
]);

export default function App() {
    const { user, loading, init, login, register, setUser } = useAuthStore();
    const { activeTab, darkMode, toggleDarkMode, showToast } = useUiStore();
    const { chats, loadChats, handleWsEvent, selectedId } = useChatStore();
    const handleWsCallEvent = useCallStore(s => s.handleWsCallEvent);

    useEffect(() => { init(); if (darkMode) document.documentElement.classList.add('dark'); }, []);

    useEffect(() => {
        if (!user) return;
        loadChats(user.id);
        return wsManager.subscribe(msg => {
            handleWsEvent(msg, user.id);
            if (CALL_EVENTS.has(msg.type)) {
                handleWsCallEvent(msg, useChatStore.getState().chats, user.id);
            }
        });
    }, [user]);

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#0c0c10] text-gray-400">Загрузка...</div>;
    if (!user) return <AuthScreen onLogin={login} onRegister={register} />;

    return (
        <div className="flex h-screen bg-white dark:bg-[#0c0c10] text-gray-900 dark:text-[#e4e4ec] overflow-hidden">
            <NavRail />
            <div className="flex flex-col flex-1 min-w-0">
                <CallOverlay />
                <GlobalAudioPlayer />
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {activeTab === 'chats' && (
                        <>
                            <ChatListPanel currentUserId={user.id} />
                            {selectedId ? (
                                <ChatView currentUserId={user.id} currentUserName={user.display_name} />
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0c0c10] text-gray-400 gap-4">
                                    <div className="w-24 h-24 rounded-full bg-white dark:bg-[#15151c] flex items-center justify-center shadow-sm"><MessageCircle size={40} className="text-gray-300 dark:text-gray-600" /></div>
                                    <p className="font-medium">Выберите чат для общения</p>
                                </div>
                            )}
                        </>
                    )}
                    {activeTab === 'calls' && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
                            <div className="w-24 h-24 rounded-full bg-white dark:bg-[#15151c] flex items-center justify-center shadow-sm text-4xl">📞</div>
                            <p className="font-medium">Откройте чат и нажмите кнопку звонка</p>
                        </div>
                    )}
                    {activeTab === 'settings' && <SettingsView darkMode={darkMode} onToggleTheme={toggleDarkMode} showToast={showToast} user={user} onUserUpdate={setUser} />}
                </div>
            </div>
            <IncomingCallModal />
        </div>
    );
}