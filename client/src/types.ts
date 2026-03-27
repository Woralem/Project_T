export type View = 'auth' | 'main';
export type Tab = 'chats' | 'calls' | 'settings';
export type AuthTab = 'login' | 'register';

export interface Message {
    id: string;
    author: string;
    text: string;
    time: string;
    own: boolean;
    status?: 'sent' | 'delivered' | 'read';
    edited?: boolean;
}

export interface Chat {
    id: string;
    name: string;
    group: boolean;
    online: boolean;
    messages: Message[];
    unread: number;
}

export interface ToastData {
    id: string;
    text: string;
    type?: 'info' | 'success' | 'error';
}

export interface ContextMenuItem {
    label: string;
    icon?: JSX.Element;
    danger?: boolean;
    onClick: () => void;
}