import React from 'react';

export function Badge({ count }: { count: number }) {
    if (!count) return null;
    return <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex-shrink-0">{count > 99 ? '99+' : count}</span>;
}