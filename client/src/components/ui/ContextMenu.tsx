import React from 'react';

export interface ContextMenuItem { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }
interface Props { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }

export function ContextMenu({ x, y, items, onClose }: Props) {
    const ax = x + 180 > window.innerWidth ? x - 180 : x;
    const ay = y + items.length * 40 > window.innerHeight ? y - items.length * 40 : y;

    return (
        <>
            <div className="fixed inset-0 z-[999]" onMouseDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
            <div className="fixed z-[1000] min-w-[170px] p-1.5 rounded-2xl bg-white dark:bg-[#18181f] border border-gray-200 dark:border-white/10 shadow-2xl" style={{ top: ay, left: ax }}>
                {items.map((item, i) => (
                    <button key={i} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition ${item.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-gray-700 dark:text-[#e4e4ec] hover:bg-gray-100 dark:hover:bg-[#20202c]'}`} onClick={() => { item.onClick(); onClose(); }}>
                        {item.icon && <span className="flex-shrink-0 opacity-80">{item.icon}</span>}
                        {item.label}
                    </button>
                ))}
            </div>
        </>
    );
}