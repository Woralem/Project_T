import React, { useCallback } from 'react';
import { Play, Pause, X, Volume2, VolumeX } from 'lucide-react';
import { useAudioStore } from '../../store/useAudioStore';
import { DraggableSlider } from './DraggableSlider';
import { formatDuration } from '../../utils';

export function GlobalAudioPlayer() {
    const {
        fileId, fileName, senderName, playing, currentTime, duration,
        volume, speed, loading,
        toggle, stop, seekByFraction, setVolume, cycleSpeed,
    } = useAudioStore();

    // ★ Не пересоздаёт audio, только двигает currentTime
    const handleSeek = useCallback((fraction: number) => {
        seekByFraction(fraction);
    }, [seekByFraction]);

    if (!fileId) return null;

    const pct = duration > 0 ? currentTime / duration : 0;
    const isVoice = fileName.startsWith('voice_');
    const displayName = isVoice ? `🎤 ${senderName}` : `🎵 ${fileName.replace(/\.[^.]+$/, '')}`;

    return (
        <div className="flex-shrink-0 bg-white dark:bg-[#15151c] border-b border-gray-200 dark:border-gray-800 px-4 py-2.5 z-20">
            <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button
                    onClick={toggle}
                    disabled={loading}
                    className="w-9 h-9 rounded-full flex items-center justify-center bg-accent/10 hover:bg-accent/20 text-accent transition active:scale-90 disabled:opacity-50 flex-shrink-0"
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    ) : playing ? (
                        <Pause size={16} />
                    ) : (
                        <Play size={16} className="ml-0.5" />
                    )}
                </button>

                {/* Info + Slider */}
                <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate leading-tight mb-1.5">{displayName}</div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-9 text-right flex-shrink-0 tabular-nums">
                            {formatDuration(currentTime)}
                        </span>
                        <DraggableSlider
                            value={pct}
                            onChange={handleSeek}
                            className="flex-1"
                        />
                        <span className="text-[10px] text-gray-400 w-9 flex-shrink-0 tabular-nums">
                            {formatDuration(duration)}
                        </span>
                    </div>
                </div>

                {/* Speed */}
                <button
                    onClick={cycleSpeed}
                    className="px-2 py-1 text-[11px] font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition active:scale-95 flex-shrink-0 min-w-[36px] text-center"
                >
                    {speed}×
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => setVolume(volume > 0 ? 0 : 100)}
                        className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                    >
                        {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                        type="range" min={0} max={100} value={volume}
                        onChange={e => setVolume(Number(e.target.value))}
                        className="w-16 h-1 accent-accent cursor-pointer"
                    />
                </div>

                {/* Close */}
                <button
                    onClick={stop}
                    className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition active:scale-90 flex-shrink-0"
                    title="Закрыть"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}