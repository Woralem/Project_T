import React, { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, X, Sliders, Music, Upload, Trash2, Play, Pause, Repeat, Lock, Waves } from 'lucide-react';
import { useCallStore } from '../../store/useCallStore';
import { Avatar } from '../ui/Avatar';
import { DraggableSlider } from '../ui/DraggableSlider';
import { formatDuration } from '../../utils';
import { uploadFile } from '../../api';
import type { SharedMediaItem } from '../../types';

export function CallOverlay() {
    const call = useCallStore();
    const { status, peerName, peerAvatarUrl, isMuted, peerMuted, duration, isEncrypted,
        peerVolume, micGain, sharedMedia, showMediaPanel,
        hangup, toggleMute, setPeerVolume, setMicGain, dismissCall,
        toggleMediaPanel, shareMedia, removeMedia, controlMedia,
        setMediaVolume, toggleMediaMute } = call;

    const [showSliders, setShowSliders] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (status === 'ended') {
            setShowSliders(false);
            const t = setTimeout(dismissCall, 4000);
            return () => clearTimeout(t);
        }
    }, [status, dismissCall]);

    if (status === 'idle' || status === 'ringing') return null;

    const isActive = ['calling', 'connecting', 'connected'].includes(status);
    const isEnded = status === 'ended';
    const isConnected = status === 'connected';

    const statusLabel = status === 'calling' ? 'Вызываем...'
        : status === 'connecting' ? 'Подключение...'
            : status === 'connected' ? formatDuration(duration)
                : call.endReason === 'rejected' ? 'Отклонено'
                    : call.endReason === 'timeout' ? 'Нет ответа'
                        : call.endReason === 'error' ? 'Ошибка соединения'
                            : 'Завершён';

    const statusColor = isConnected ? 'text-green-400' : isEnded ? 'text-red-400' : 'text-amber-400';

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        setUploading(true);
        try { const att = await uploadFile(file, file.name); shareMedia(att.id, file.name); }
        catch { /* */ }
        finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    };

    // Анимация пульса для вызова
    const showPulse = status === 'calling';

    return (
        <div className="flex-shrink-0 z-30 bg-gradient-to-r from-[#1a1a2e] to-[#16213e] text-white border-b border-white/5">
            {/* Основная панель */}
            <div className="flex items-center gap-4 px-5 py-3">
                {/* Аватар с пульсацией */}
                <div className="relative flex-shrink-0">
                    {showPulse && <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping" style={{ animationDuration: '2s' }} />}
                    <Avatar name={peerName || '?'} size={44} avatarUrl={peerAvatarUrl} />
                    {isConnected && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#1a1a2e]" />
                    )}
                </div>

                {/* Инфо */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold truncate">{peerName}</span>
                        {peerMuted && (
                            <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-400/15 px-1.5 py-0.5 rounded-full">
                                <MicOff size={10} /> мьют
                            </span>
                        )}
                        {isEncrypted && isConnected && (
                            <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/15 px-1.5 py-0.5 rounded-full">
                                <Lock size={10} /> E2E
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-medium ${statusColor}`}>{statusLabel}</span>
                        {isConnected && (
                            <div className="flex items-center gap-0.5">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="w-0.5 bg-green-400 rounded-full animate-pulse" style={{ height: 4 + Math.random() * 8, animationDelay: `${i * 200}ms`, animationDuration: '800ms' }} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Кнопки управления */}
                <div className="flex items-center gap-2">
                    {isConnected && (
                        <>
                            <CallBtn active={showMediaPanel} onClick={toggleMediaPanel} title="Музыка" badge={sharedMedia.length || undefined}>
                                <Music size={17} />
                            </CallBtn>
                            <CallBtn active={showSliders} onClick={() => setShowSliders(v => !v)} title="Громкость">
                                <Sliders size={17} />
                            </CallBtn>
                        </>
                    )}

                    {isActive && (
                        <>
                            <CallBtn active={isMuted} danger={isMuted} onClick={toggleMute} title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
                                {isMuted ? <MicOff size={17} /> : <Mic size={17} />}
                            </CallBtn>
                            <button className="p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all active:scale-90 shadow-lg shadow-red-500/25" onClick={hangup} title="Завершить">
                                <PhoneOff size={17} />
                            </button>
                        </>
                    )}

                    {isEnded && (
                        <button className="p-2 text-white/50 hover:text-white transition active:scale-90" onClick={dismissCall}>
                            <X size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Слайдеры громкости */}
            {showSliders && isConnected && (
                <div className="px-5 pb-3 pt-0 flex gap-6 animate-in slide-in-from-top-2 duration-200">
                    <VolumeRow icon={<Mic size={14} />} label="Микрофон" value={micGain} onChange={setMicGain} />
                    <VolumeRow icon={<Volume2 size={14} />} label="Собеседник" value={peerVolume} onChange={setPeerVolume} />
                </div>
            )}

            {/* Музыкальная панель */}
            {showMediaPanel && isConnected && (
                <div className="px-5 pb-3 pt-1 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                    <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
                    <button className="w-full flex items-center justify-center gap-2 py-2 mb-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[12px] font-semibold rounded-xl transition active:scale-[0.98] disabled:opacity-40" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" /> : <Upload size={14} />}
                        {uploading ? 'Загрузка...' : '+ Добавить аудио'}
                    </button>

                    {!sharedMedia.length && <p className="text-center text-[11px] text-white/30 py-1">Оба участника будут слышать добавленную музыку</p>}

                    {sharedMedia.map(item => (
                        <MediaCard key={item.id} item={item}
                            onPlayPause={() => controlMedia(item.id, item.isPlaying ? 'pause' : 'play')}
                            onLoop={() => controlMedia(item.id, 'loop')}
                            onSeek={(f) => controlMedia(item.id, 'seek', f * item.duration)}
                            onRemove={() => removeMedia(item.id)}
                            onVolumeChange={(v) => setMediaVolume(item.id, v)}
                            onMuteToggle={() => toggleMediaMute(item.id)}
                        />
                    ))}
                </div>
            )}

            {/* Прогресс-бар анимация */}
            {(status === 'calling' || status === 'connecting') && (
                <div className="h-[2px] relative overflow-hidden">
                    <div className={`absolute inset-0 ${status === 'calling' ? 'bg-amber-400' : 'bg-blue-400'}`}>
                        <div className="h-full w-1/3 bg-white/30 animate-[shimmer_1.5s_infinite]" style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Кнопка управления ──

function CallBtn({ children, active, danger, onClick, title, badge }: {
    children: React.ReactNode; active?: boolean; danger?: boolean;
    onClick: () => void; title?: string; badge?: number;
}) {
    return (
        <button
            className={`relative p-2.5 rounded-xl transition-all active:scale-90 ${danger ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : active ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
            onClick={onClick} title={title}
        >
            {children}
            {badge && badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent text-[9px] font-bold flex items-center justify-center">{badge}</span>
            )}
        </button>
    );
}

// ── Ряд громкости ──

function VolumeRow({ icon, label, value, onChange }: {
    icon: React.ReactNode; label: string; value: number; onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2 flex-1">
            <span className="text-white/40">{icon}</span>
            <span className="text-[10px] text-white/40 w-16">{label}</span>
            <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))}
                className="flex-1 h-1 accent-white cursor-pointer appearance-none bg-white/10 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow" />
            <span className="text-[10px] text-white/50 w-8 text-right">{value}%</span>
        </div>
    );
}

// ── Карточка медиа-трека ──

function MediaCard({ item, onPlayPause, onLoop, onSeek, onRemove, onVolumeChange, onMuteToggle }: {
    item: SharedMediaItem; onPlayPause: () => void; onLoop: () => void;
    onSeek: (f: number) => void; onRemove: () => void;
    onVolumeChange: (v: number) => void; onMuteToggle: () => void;
}) {
    const pct = item.duration > 0 ? item.currentTime / item.duration : 0;

    return (
        <div className="mt-2 p-3 bg-white/5 rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-semibold truncate flex-1 text-white/80">🎵 {item.title || item.fileName}</span>
                <span className="text-[10px] text-white/30">{item.userName}</span>
                <button className="p-1 text-white/30 hover:text-red-400 transition active:scale-90" onClick={onRemove}><Trash2 size={12} /></button>
            </div>

            <DraggableSlider value={pct} onChange={onSeek} className="mb-2" height="h-1" fillClassName="bg-white/60" thumbClassName="bg-white" />

            <div className="flex items-center gap-1.5">
                <button className="p-1.5 rounded-lg hover:bg-white/10 transition active:scale-90 text-white/70 hover:text-white" onClick={onPlayPause}>
                    {item.isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>
                <button className={`p-1.5 rounded-lg hover:bg-white/10 transition active:scale-90 ${item.isLooping ? 'text-accent' : 'text-white/40 hover:text-white/70'}`} onClick={onLoop}>
                    <Repeat size={13} />
                </button>
                <span className="text-[10px] text-white/40 flex-1">{formatDuration(item.currentTime)} / {formatDuration(item.duration)}</span>
                <button className="p-1 text-white/40 hover:text-white transition" onClick={onMuteToggle}>
                    {item.localMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                <input type="range" min={0} max={100} value={item.localMuted ? 0 : item.localVolume} onChange={e => onVolumeChange(Number(e.target.value))}
                    className="w-14 h-1 accent-white cursor-pointer appearance-none bg-white/10 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />
            </div>
        </div>
    );
}

// Нужен для shimmer анимации — добавь в index.css:
// @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }