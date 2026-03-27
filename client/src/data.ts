import type { Chat } from './types';

export const MOCK_CHATS: Chat[] = [
    {
        id: '1', name: 'Миша', group: false, online: true, unread: 2,
        messages: [
            { id: 'm1', author: 'Миша', text: 'Привет! Как мессенджер продвигается?', time: '14:32', own: false },
            { id: 'm2', author: 'Ты', text: 'Потихоньку, UI рисую сейчас', time: '14:33', own: true, status: 'read' },
            { id: 'm3', author: 'Миша', text: 'Красиво получается?', time: '14:33', own: false },
            { id: 'm4', author: 'Ты', text: 'Сейчас переделываю, старый был страшный 😅', time: '14:35', own: true, status: 'delivered' },
            { id: 'm5', author: 'Миша', text: 'Хахах, покажешь когда будет готово', time: '15:01', own: false },
            { id: 'm6', author: 'Миша', text: 'Кстати, когда звонки будут?', time: '15:02', own: false },
        ],
    },
    {
        id: '2', name: 'Лёша', group: false, online: false, unread: 0,
        messages: [
            { id: 'l1', author: 'Лёша', text: 'Сделай тестовый билд когда будет готово', time: '12:15', own: false },
            { id: 'l2', author: 'Ты', text: 'Окей, скину ссылку на скачивание', time: '12:20', own: true, status: 'read' },
            { id: 'l3', author: 'Лёша', text: 'Супер, жду!', time: '12:21', own: false },
        ],
    },
    {
        id: '3', name: 'Группа курса', group: true, online: false, unread: 5,
        messages: [
            { id: 'g1', author: 'Аня', text: 'Кто идёт на пару завтра?', time: '09:45', own: false },
            { id: 'g2', author: 'Дима', text: 'Я буду', time: '09:50', own: false },
            { id: 'g3', author: 'Ты', text: 'Тоже приду наверное', time: '10:00', own: true, status: 'sent' },
            { id: 'g4', author: 'Аня', text: 'Отлично! Захватите конспекты пожалуйста', time: '10:05', own: false },
            { id: 'g5', author: 'Петя', text: 'Кто-нибудь делал домашку по матану?', time: '11:30', own: false },
        ],
    },
    {
        id: '4', name: 'Дима', group: false, online: true, unread: 0,
        messages: [
            { id: 'd1', author: 'Дима', text: 'Йо, приветствую в мессенджере!', time: 'Вчера', own: false },
        ],
    },
];