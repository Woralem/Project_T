export const uid = () => Math.random().toString(36).slice(2, 10);

const AVATAR_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#e91e8a'];

export const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

export const getAvatarColor = (name: string) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

export function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const y = new Date(now); y.setDate(y.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return 'Вчера';
        return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    } catch { return ''; }
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatDate(iso: string): string {
    try { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
    catch { return ''; }
}

export function formatDateFull(iso: string): string {
    try { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
    catch { return ''; }
}

export function formatDuration(s: number): string {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

export function getMediaType(mime: string, filename?: string): 'image' | 'video' | 'audio' | 'file' {
    // For encrypted files (mime=application/octet-stream), check filename
    if (filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
        if (ext && ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
        if (ext && ['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a', 'webm', 'opus', 'weba'].includes(ext)) return 'audio';
    }
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/') && !mime.includes('webm')) return 'video';
    if (mime.startsWith('audio/') || mime.includes('webm')) return 'audio';
    return 'file';
}

export function getFileIcon(mime: string): string {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '📦';
    if (mime.includes('word') || mime.includes('doc')) return '📝';
    if (mime.includes('sheet') || mime.includes('excel') || mime.includes('xls')) return '📊';
    return '📎';
}