import React from 'react';

export function Badge({ count }: { count: number }) {
    if (!count) return null;
    return <span className="badge">{count > 99 ? '99+' : count}</span>;
}