import React from 'react';
import type { Tab } from '../../types';
import { Icon } from '../../icons';

interface Props {
    tab: Tab;
    onTab: (t: Tab) => void;
    darkMode: boolean;
    onToggleTheme: () => void;
    onLogout: () => void;
}

const NAV_ITEMS: { id: Tab; icon: (s?: number) => JSX.Element }[] = [
    { id: 'chats', icon: Icon.chat },
    { id: 'calls', icon: Icon.phone },
    { id: 'settings', icon: Icon.settings },
];

export function NavRail({ tab, onTab, darkMode, onToggleTheme, onLogout }: Props) {
    return (
        <nav className="nav-rail">
            <div className="nav-rail-group">
                {NAV_ITEMS.map(item => (
                    <button
                        key={item.id}
                        className={`nav-btn ${tab === item.id ? 'active' : ''}`}
                        onClick={() => onTab(item.id)}
                        title={item.id}
                    >
                        <span className="nav-btn-indicator" />
                        {item.icon(22)}
                    </button>
                ))}
            </div>
            <div className="nav-rail-group">
                <button className="nav-btn" onClick={onToggleTheme} title="Тема">
                    {darkMode ? Icon.sun(22) : Icon.moon(22)}
                </button>
                <button className="nav-btn" onClick={onLogout} title="Выйти">
                    {Icon.logout(22)}
                </button>
            </div>
        </nav>
    );
}