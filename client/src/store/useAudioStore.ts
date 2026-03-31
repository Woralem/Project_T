import { create } from 'zustand';
import { getFileUrl } from '../api';

interface AudioState {
    fileId: string | null;
    fileName: string;
    senderName: string;
    messageId: string | null;
    chatId: string | null;
    playing: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    speed: number;
    loading: boolean;
    _audio: HTMLAudioElement | null;
}

interface AudioActions {
    play: (opts: { fileId: string; fileName: string; senderName: string; messageId?: string; chatId?: string }) => void;
    toggle: () => void;
    pause: () => void;
    stop: () => void;
    seek: (time: number) => void;
    seekByFraction: (fraction: number) => void;
    setVolume: (v: number) => void;
    cycleSpeed: () => void;
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];

export const useAudioStore = create<AudioState & AudioActions>((set, get) => ({
    fileId: null, fileName: '', senderName: '', messageId: null, chatId: null,
    playing: false, currentTime: 0, duration: 0, volume: 100, speed: 1,
    loading: false, _audio: null,

    play: ({ fileId, fileName, senderName, messageId, chatId }) => {
        const s = get();

        // Тот же трек — просто toggle
        if (s.fileId === fileId && s._audio) {
            if (s._audio.paused) {
                s._audio.play().catch(() => { });
                set({ playing: true });
            } else {
                s._audio.pause();
                set({ playing: false });
            }
            return;
        }

        // Новый трек — остановить старый
        if (s._audio) {
            s._audio.pause();
            s._audio.removeAttribute('src');
            s._audio.load();
        }

        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = s.volume / 100;
        audio.playbackRate = s.speed;

        // Устанавливаем state ДО загрузки
        set({
            fileId, fileName, senderName, messageId, chatId,
            playing: false, currentTime: 0, duration: 0, loading: true,
            _audio: audio,
        });

        // ★ Обработчики НЕ пересоздают audio
        audio.onloadedmetadata = () => {
            // Только обновляем duration если это тот же файл
            if (get().fileId === fileId) {
                set({ duration: audio.duration || 0, loading: false });
            }
        };

        audio.ontimeupdate = () => {
            if (get().fileId === fileId && get()._audio === audio) {
                set({ currentTime: audio.currentTime });
            }
        };

        audio.onended = () => {
            if (get().fileId === fileId) {
                set({ playing: false, currentTime: 0 });
            }
        };

        audio.onerror = () => {
            if (get().fileId === fileId) {
                set({ loading: false });
            }
        };

        audio.oncanplay = () => {
            if (get().fileId === fileId && get().loading) {
                set({ loading: false });
            }
        };

        // Загружаем
        audio.src = getFileUrl(fileId);
        audio.play()
            .then(() => {
                if (get().fileId === fileId) set({ playing: true });
            })
            .catch(() => {
                if (get().fileId === fileId) set({ loading: false });
            });
    },

    toggle: () => {
        const { _audio, playing } = get();
        if (!_audio) return;
        if (playing) {
            _audio.pause();
            set({ playing: false });
        } else {
            _audio.play().catch(() => { });
            set({ playing: true });
        }
    },

    pause: () => {
        get()._audio?.pause();
        set({ playing: false });
    },

    stop: () => {
        const { _audio } = get();
        if (_audio) {
            _audio.pause();
            _audio.removeAttribute('src');
            _audio.load();
        }
        set({
            fileId: null, fileName: '', senderName: '', messageId: null, chatId: null,
            playing: false, currentTime: 0, duration: 0, _audio: null, loading: false,
        });
    },

    // ★ ФИКС: seek не перезапускает аудио
    seek: (time) => {
        const { _audio, duration } = get();
        if (!_audio || !duration) return;
        const clamped = Math.max(0, Math.min(time, duration));
        _audio.currentTime = clamped;
        set({ currentTime: clamped });
    },

    seekByFraction: (fraction) => {
        const { _audio, duration } = get();
        if (!_audio || !duration) return;
        const clamped = Math.max(0, Math.min(1, fraction));
        const time = clamped * duration;
        _audio.currentTime = time;
        set({ currentTime: time });
    },

    setVolume: (v) => {
        const vol = Math.max(0, Math.min(100, v));
        if (get()._audio) get()._audio!.volume = vol / 100;
        set({ volume: vol });
    },

    cycleSpeed: () => {
        const { speed, _audio } = get();
        const idx = SPEEDS.indexOf(speed);
        const next = SPEEDS[(idx + 1) % SPEEDS.length];
        if (_audio) _audio.playbackRate = next;
        set({ speed: next });
    },
}));