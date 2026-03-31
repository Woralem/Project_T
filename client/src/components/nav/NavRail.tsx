import React from 'react';
import { MessageCircle, Phone, Settings, Sun, Moon, LogOut } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useAuthStore } from '../../store/useAuthStore';

const tabs = [
    { id: 'chats' as const, icon: MessageCircle },
    { id: 'calls' as const, icon: Phone },
    { id: 'settings' as const, icon: Settings },
] as const;

export function NavRail() {
    const { activeTab, setActiveTab, darkMode, toggleDarkMode } = useUiStore();
    const { logout } = useAuthStore();

    const btn = (active: boolean) =>
        `relative w-12 h-12 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-accent/10 text-accent' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`;

    return (
        <nav className="w-16 flex-shrink-0 flex flex-col justify-between items-center py-4 bg-white dark:bg-[#111116] border-r border-gray-200 dark:border-gray-800">
            <div className="flex flex-col gap-2">
                {tabs.map(({ id, icon: Icon }) => (
                    <button key={id} className={btn(activeTab === id)} onClick={() => setActiveTab(id)}>
                        {activeTab === id && <span className="absolute -left-2 w-1 h-5 bg-accent rounded-full" />}
                        <Icon size={24} />
                    </button>
                ))}
            </div>
            <div className="flex flex-col gap-2">
                <button className={btn(false)} onClick={toggleDarkMode}>
                    {darkMode ? <Sun size={24} /> : <Moon size={24} />}
                </button>
                <button className={btn(false)} onClick={logout}><LogOut size={24} /></button>
            </div>
        </nav>
    );
}