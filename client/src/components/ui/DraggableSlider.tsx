import React, { useRef, useCallback, useState, useEffect } from 'react';

interface Props {
    value: number; // 0..1
    onChange: (value: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    className?: string;
    fillClassName?: string;
    thumbClassName?: string;
    height?: string;
}

export function DraggableSlider({
    value, onChange, onDragStart, onDragEnd,
    className = '',
    fillClassName = 'bg-accent',
    thumbClassName = 'bg-accent',
    height = 'h-1.5',
}: Props) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const draggingRef = useRef(false);

    const calcFraction = useCallback((clientX: number) => {
        const track = trackRef.current;
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const el = trackRef.current;
        if (!el) return;

        // Capture pointer for smooth dragging
        el.setPointerCapture(e.pointerId);

        setDragging(true);
        draggingRef.current = true;
        onDragStart?.();

        const fraction = calcFraction(e.clientX);
        onChange(fraction);
    }, [calcFraction, onChange, onDragStart]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(calcFraction(e.clientX));
    }, [calcFraction, onChange]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!draggingRef.current) return;
        e.preventDefault();

        const el = trackRef.current;
        if (el) el.releasePointerCapture(e.pointerId);

        setDragging(false);
        draggingRef.current = false;
        onDragEnd?.();
    }, [onDragEnd]);

    const pct = Math.max(0, Math.min(100, value * 100));

    return (
        <div
            ref={trackRef}
            className={`relative ${height} rounded-full bg-gray-200 dark:bg-gray-700 cursor-pointer group select-none touch-none ${className}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: 'none' }}
        >
            {/* Увеличенная зона касания */}
            <div className="absolute -inset-y-2 inset-x-0" />

            {/* Заполнение */}
            <div
                className={`h-full rounded-full pointer-events-none ${dragging ? '' : 'transition-[width] duration-75'} ${fillClassName}`}
                style={{ width: `${pct}%` }}
            />

            {/* Ползунок */}
            <div
                className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-md pointer-events-none transition-transform ${dragging ? 'w-4 h-4 scale-100' : 'w-3.5 h-3.5 scale-0 group-hover:scale-100'
                    } ${thumbClassName}`}
                style={{ left: `calc(${pct}% - ${dragging ? 8 : 7}px)` }}
            />
        </div>
    );
}