import React from 'react';
import type { ContextMenuItem } from '../../types';

interface Props {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
    /* Сдвигаем если меню вылезает за экран */
    const adjustedX = x + 180 > window.innerWidth ? x - 180 : x;
    const adjustedY = y + items.length * 40 > window.innerHeight ? y - items.length * 40 : y;

    return (
        <>
            <div className="context-backdrop" onMouseDown={onClose} />
            <div
                className="context-menu"
                style={{ top: adjustedY, left: adjustedX }}
            >
                {items.map((item, i) => (
                    <button
                        key={i}
                        className={`context-item ${item.danger ? 'danger' : ''}`}
                        onClick={() => { item.onClick(); onClose(); }}
                    >
                        {item.icon && <span className="context-item-icon">{item.icon}</span>}
                        {item.label}
                    </button>
                ))}
            </div>
        </>
    );
}