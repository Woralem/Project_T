import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Lock } from 'lucide-react';
import { useCallStore } from '../../store/useCallStore';
import { Avatar } from '../ui/Avatar';

export function IncomingCallModal() {
    const { status, peerName, peerAvatarUrl, isEncrypted, answerCall, rejectCall } = useCallStore();
    const [ring, setRing] = useState(0);

    // Таймер для пульсации
    useEffect(() => {
        if (status !== 'ringing') return;
        const t = setInterval(() => setRing(r => r + 1), 1000);
        return () => clearInterval(t);
    }, [status]);

    if (status !== 'ringing') return null;

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="relative bg-gradient-to-b from-[#1a1a2e] to-[#0f0f1a] rounded-3xl p-10 shadow-2xl flex flex-col items-center gap-5 min-w-[300px] border border-white/5">

                {/* Пульсация */}
                <div className="relative">
                    <div className="absolute inset-[-12px] rounded-full border-2 border-green-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-[-24px] rounded-full border border-green-400/15 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
                    <Avatar name={peerName || '?'} size={96} avatarUrl={peerAvatarUrl} />
                </div>

                <div className="text-center mt-2">
                    <h3 className="text-[22px] font-bold text-white">{peerName}</h3>
                    <p className="text-[14px] text-white/50 mt-1 flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Входящий звонок
                    </p>
                </div>

                {isEncrypted && (
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full border border-green-400/20">
                        <Lock size={13} /> Зашифрованный
                    </span>
                )}

                <div className="flex gap-8 mt-6">
                    <div className="flex flex-col items-center gap-2">
                        <button className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 transition-all active:scale-90 hover:scale-105" onClick={rejectCall}>
                            <PhoneOff size={26} />
                        </button>
                        <span className="text-[11px] text-white/40">Отклонить</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <button className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-500/40 transition-all active:scale-90 hover:scale-105 animate-bounce" onClick={answerCall} style={{ animationDuration: '1.5s' }}>
                            <Phone size={26} />
                        </button>
                        <span className="text-[11px] text-white/40">Принять</span>
                    </div>
                </div>
            </div>
        </div>
    );
}