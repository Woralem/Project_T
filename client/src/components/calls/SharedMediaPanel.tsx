import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SharedMediaItem } from '../../types';
import { getFileUrl, uploadFile } from '../../api';
import { Icon } from '../../icons';

interface Props {
    media: SharedMediaItem[];
    currentUserId: string;
    onShare: (fileId: string, fileName: string) => void;
    onRemove: (mediaId: string) => void;
    onControl: (mediaId: string, action: 'play' | 'pause' | 'seek' | 'loop', time?: number) => void;
    onLocalVolumeChange: (mediaId: string, volume: number) => void;
    onLocalMuteToggle: (mediaId: string) => void;
    onTitleUpdate: (mediaId: string, title: string) => void;
    onTimeUpdate: (mediaId: string, currentTime: number, duration: number) => void;
    showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

const AUDIO_TYPES = '.mp3,.ogg,.wav,.flac,.aac,.m4a,.webm,.opus';

export function SharedMediaPanel({
    media, currentUserId, onShare, onRemove, onControl,
    onLocalVolumeChange, onLocalMuteToggle, onTitleUpdate, onTimeUpdate, showToast,
}: Props) {
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const timerRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

    // ── Cleanup при unmount ──────────────────────────────

    useEffect(() => {
        return () => {
            audioRefs.current.forEach(a => { a.pause(); a.src = ''; });
            audioRefs.current.clear();
            timerRefs.current.forEach(t => clearInterval(t));
            timerRefs.current.clear();
        };
    }, []);

    // ── Создание / удаление audio элементов ──────────────

    useEffect(() => {
        const currentIds = new Set(media.map(m => m.id));

        // Удаляем для removed
        audioRefs.current.forEach((audio, id) => {
            if (!currentIds.has(id)) {
                audio.pause();
                audio.src = '';
                audioRefs.current.delete(id);
                const timer = timerRefs.current.get(id);
                if (timer) { clearInterval(timer); timerRefs.current.delete(id); }
            }
        });

        // Создаём новые
        media.forEach(item => {
            if (audioRefs.current.has(item.id)) return;

            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.preload = 'auto';
            audio.src = getFileUrl(item.fileId);
            audio.volume = item.localMuted ? 0 : item.localVolume / 100;

            audio.onloadedmetadata = () => {
                onTimeUpdate(item.id, 0, audio.duration || 0);
                const name = item.fileName.replace(/\.[^.]+$/, '') || 'Аудио';
                onTitleUpdate(item.id, name);
            };

            audio.onended = () => {
                onControl(item.id, 'pause');
                onTimeUpdate(item.id, 0, audio.duration || 0);
            };

            audio.onerror = () => {
                console.error('[Media] Audio load error:', item.fileId);
                showToast('Ошибка загрузки аудио', 'error');
            };

            if (item.isPlaying) {
                audio.play().catch(() => { });
            }

            audioRefs.current.set(item.id, audio);

            // Таймер обновления прогресса
            const timer = setInterval(() => {
                const a = audioRefs.current.get(item.id);
                if (!a) return;
                onTimeUpdate(item.id, a.currentTime, a.duration || 0);
            }, 500);
            timerRefs.current.set(item.id, timer);
        });
    }, [media.map(m => m.id).join(',')]);

    // ── Синхронизация play/pause и loop ──────────────────

    useEffect(() => {
        media.forEach(item => {
            const audio = audioRefs.current.get(item.id);
            if (!audio) return;

            audio.loop = item.isLooping;

            if (item.isPlaying && audio.paused) {
                audio.play().catch(() => { });
            } else if (!item.isPlaying && !audio.paused) {
                audio.pause();
            }
        });
    }, [media.map(m => `${m.id}:${m.isPlaying}:${m.isLooping}`).join(',')]);

    // ── Синхронизация громкости ──────────────────────────

    useEffect(() => {
        media.forEach(item => {
            const audio = audioRefs.current.get(item.id);
            if (!audio) return;
            audio.volume = item.localMuted ? 0 : item.localVolume / 100;
        });
    }, [media.map(m => `${m.id}:${m.localVolume}:${m.localMuted}`).join(',')]);

    // ── Загрузка файла ──────────────────────────────────

    const handleUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|ogg|wav|flac|aac|m4a|webm|opus)$/i)) {
            showToast('Выберите аудиофайл', 'error');
            return;
        }
        if (file.size > 25 * 1024 * 1024) {
            showToast('Файл слишком большой (макс 25MB)', 'error');
            return;
        }

        setUploading(true);
        try {
            const att = await uploadFile(file, file.name);
            onShare(att.id, file.name);
            showToast('Музыка добавлена!', 'success');
        } catch (e: any) {
            showToast(e.message || 'Ошибка загрузки', 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [onShare, showToast]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
    };

    // ── Drag & Drop ─────────────────────────────────────

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleUpload(file);
    };

    // ── Seek по клику (только локально) ─────────────────

    const handleSeek = (item: SharedMediaItem, e: React.MouseEvent<HTMLDivElement>) => {
        if (!item.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const time = pct * item.duration;
        const audio = audioRefs.current.get(item.id);
        if (audio) audio.currentTime = time;
        onControl(item.id, 'seek', time);
    };

    const fmt = (s: number) => {
        if (!s || !isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    };

    return (
        <div
            className={`media-panel ${dragOver ? 'media-drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Кнопка загрузки */}
            <div className="media-upload-row">
                <button
                    className="media-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? '⏳ Загрузка...' : '🎵 Добавить музыку'}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={AUDIO_TYPES}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
            </div>

            {/* Drag hint */}
            {dragOver && (
                <div className="media-drop-hint">
                    Отпустите файл чтобы добавить
                </div>
            )}

            {/* Пустое состояние */}
            {media.length === 0 && !dragOver && (
                <div className="media-empty">
                    Перетащите аудиофайл или нажмите кнопку выше
                </div>
            )}

            {/* Список треков */}
            {media.map(item => {
                const pct = item.duration > 0 ? (item.currentTime / item.duration) * 100 : 0;
                const isOwner = item.userId === currentUserId;

                return (
                    <div key={item.id} className="media-card">
                        <div className="media-card-header">
                            <div className="media-card-info">
                                <span className="media-card-title">
                                    🎵 {item.title || item.fileName || 'Загрузка...'}
                                </span>
                                <span className="media-card-owner">
                                    {isOwner ? 'Вы' : item.userName}
                                </span>
                            </div>
                            {isOwner && (
                                <button
                                    className="media-remove-btn"
                                    onClick={() => onRemove(item.id)}
                                    title="Убрать"
                                >
                                    {Icon.x(14)}
                                </button>
                            )}
                        </div>

                        {/* Прогресс */}
                        <div className="media-progress" onClick={e => handleSeek(item, e)}>
                            <div className="media-progress-fill" style={{ width: `${pct}%` }} />
                        </div>

                        <div className="media-controls">
                            <button
                                className="media-ctrl-btn"
                                onClick={() => onControl(item.id, item.isPlaying ? 'pause' : 'play')}
                                title={item.isPlaying ? 'Пауза' : 'Плей'}
                            >
                                {item.isPlaying ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="4" width="4" height="16" rx="1" />
                                        <rect x="14" y="4" width="4" height="16" rx="1" />
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        <polygon points="5,3 19,12 5,21" />
                                    </svg>
                                )}
                            </button>

                            <button
                                className="media-ctrl-btn"
                                style={{ color: item.isLooping ? 'var(--accent)' : 'inherit' }}
                                onClick={() => onControl(item.id, 'loop')}
                                title={item.isLooping ? 'Выключить повтор' : 'Включить повтор'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="17 1 21 5 17 9"></polyline>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                                    <polyline points="7 23 3 19 7 15"></polyline>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                                </svg>
                            </button>

                            <span className="media-time">
                                {fmt(item.currentTime)} / {fmt(item.duration)}
                            </span>

                            <button
                                className={`media-ctrl-btn ${item.localMuted ? 'muted' : ''}`}
                                onClick={() => onLocalMuteToggle(item.id)}
                                title={item.localMuted ? 'Включить звук' : 'Выключить звук'}
                            >
                                {item.localMuted ? Icon.volumeOff(14) : Icon.volumeHigh(14)}
                            </button>

                            <input
                                type="range" min={0} max={100}
                                value={item.localMuted ? 0 : item.localVolume}
                                onChange={e => onLocalVolumeChange(item.id, Number(e.target.value))}
                                className="media-volume-slider"
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}