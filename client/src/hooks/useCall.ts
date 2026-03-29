import { useState, useCallback, useRef, useEffect } from 'react';
import type { CallState, CallStatus, LocalChat, WsServerMsg } from '../types';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';

const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const CALL_TIMEOUT_MS = 35_000;

const INITIAL: CallState = {
    status: 'idle',
    chatId: null,
    callId: null,
    peerId: null,
    peerName: null,
    isMuted: false,
    duration: 0,
    isEncrypted: false,
};

interface PendingOffer {
    chatId: string;
    callId: string;
    sdp: string;
    encrypted: boolean;
    callerId: string;
    callerName: string;
}

// ── Шифрование сигнализации ──────────────────────────────

async function encryptSignaling(chatId: string, data: string): Promise<{ data: string; encrypted: boolean }> {
    if (!cryptoManager.hasChatKey(chatId)) return { data, encrypted: false };
    try {
        const payload = await cryptoManager.encrypt(chatId, data);
        return { data: JSON.stringify(payload), encrypted: true };
    } catch {
        return { data, encrypted: false };
    }
}

async function decryptSignaling(chatId: string, data: string, isEncrypted: boolean): Promise<string> {
    if (!isEncrypted) return data;
    try {
        const payload = JSON.parse(data);
        return await cryptoManager.decrypt(chatId, payload.ciphertext, payload.nonce);
    } catch (e) {
        console.warn('[Call] Failed to decrypt signaling:', e);
        return data;
    }
}

// ══════════════════════════════════════════════════════════

export function useCall(currentUserId: string, chats: LocalChat[]) {
    const [callState, setCallState] = useState<CallState>(INITIAL);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingOfferRef = useRef<PendingOffer | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const ringtoneCtxRef = useRef<AudioContext | null>(null);
    const ringtoneOscRef = useRef<OscillatorNode | null>(null);
    const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stateRef = useRef(callState);
    stateRef.current = callState;
    const chatsRef = useRef(chats);
    chatsRef.current = chats;

    // ── Инициализация аудио-элемента ─────────────────────

    useEffect(() => {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current = audio;
        return () => {
            audio.srcObject = null;
        };
    }, []);

    // ── Рингтон ──────────────────────────────────────────

    const startRingtone = useCallback(() => {
        try {
            const ctx = new AudioContext();
            ringtoneCtxRef.current = ctx;
            let on = false;
            ringtoneIntervalRef.current = setInterval(() => {
                if (on) {
                    ringtoneOscRef.current?.stop();
                    ringtoneOscRef.current = null;
                    on = false;
                } else {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = 440;
                    gain.gain.value = 0.15;
                    osc.connect(gain).connect(ctx.destination);
                    osc.start();
                    ringtoneOscRef.current = osc;
                    on = true;
                }
            }, 500);
        } catch { /* audio not available */ }
    }, []);

    const stopRingtone = useCallback(() => {
        ringtoneOscRef.current?.stop();
        ringtoneOscRef.current = null;
        if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
        ringtoneCtxRef.current?.close();
        ringtoneCtxRef.current = null;
    }, []);

    // ── Утилиты ──────────────────────────────────────────

    const cleanup = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        stopRingtone();

        pcRef.current?.close();
        pcRef.current = null;
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        pendingOfferRef.current = null;
        pendingCandidatesRef.current = [];
    }, [stopRingtone]);

    const startTimer = useCallback(() => {
        if (timerRef.current) return;
        timerRef.current = setInterval(() => {
            setCallState(s => ({ ...s, duration: s.duration + 1 }));
        }, 1000);
    }, []);

    const getPeerInfo = useCallback((chatId: string): { name: string; avatarUrl?: string } => {
        const chat = chatsRef.current.find(c => c.id === chatId);
        if (!chat) return { name: 'Неизвестный' };
        if (!chat.is_group) {
            const other = chat.members.find(m => m.user_id !== currentUserId);
            return { name: other?.display_name || chat.name, avatarUrl: other?.avatar_url };
        }
        return { name: chat.name };
    }, [currentUserId]);

    // ── Создание PeerConnection ─────────────────────────

    const createPC = useCallback((chatId: string, callId: string) => {
        const pc = new RTCPeerConnection(ICE_CONFIG);

        pc.onicecandidate = async (e) => {
            if (!e.candidate) return;
            const candidateStr = JSON.stringify(e.candidate.toJSON());
            const enc = await encryptSignaling(chatId, candidateStr);
            wsManager.send({
                type: 'call_ice',
                payload: {
                    chat_id: chatId,
                    call_id: callId,
                    candidate: enc.data,
                    encrypted: enc.encrypted,
                },
            });
        };

        pc.ontrack = (e) => {
            console.log('[Call] Remote track received');
            if (remoteAudioRef.current && e.streams[0]) {
                remoteAudioRef.current.srcObject = e.streams[0];
            }
        };

        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            console.log('[Call] Connection state:', st);
            if (st === 'connected') {
                if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
                const isEnc = cryptoManager.hasChatKey(chatId);
                setCallState(s => ({ ...s, status: 'connected', isEncrypted: isEnc }));
                startTimer();
            } else if (st === 'disconnected' || st === 'failed' || st === 'closed') {
                if (stateRef.current.status !== 'idle' && stateRef.current.status !== 'ended') {
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'hangup' }));
                    cleanup();
                }
            }
        };

        pcRef.current = pc;
        return pc;
    }, [cleanup, startTimer]);

    // ── Получить аудио-поток ─────────────────────────────

    const getAudioStream = useCallback(async (): Promise<MediaStream> => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        });
        localStreamRef.current = stream;
        return stream;
    }, []);

    // ── Добавить pending ICE кандидатов ──────────────────

    const flushPendingCandidates = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) return;
        for (const c of pendingCandidatesRef.current) {
            try { await pc.addIceCandidate(c); } catch (e) { console.warn('[Call] addIceCandidate:', e); }
        }
        pendingCandidatesRef.current = [];
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Начать звонок (исходящий)
    // ═══════════════════════════════════════════════════════

    const startCall = useCallback(async (chatId: string) => {
        if (stateRef.current.status !== 'idle') return;

        const callId = crypto.randomUUID();
        const peer = getPeerInfo(chatId);

        try {
            const stream = await getAudioStream();
            const pc = createPC(chatId, callId);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const enc = await encryptSignaling(chatId, offer.sdp!);

            wsManager.send({
                type: 'call_offer',
                payload: {
                    chat_id: chatId,
                    call_id: callId,
                    sdp: enc.data,
                    encrypted: enc.encrypted,
                },
            });

            setCallState({
                status: 'calling',
                chatId,
                callId,
                peerId: null,
                peerName: peer.name,
                peerAvatarUrl: peer.avatarUrl,
                isMuted: false,
                duration: 0,
                isEncrypted: enc.encrypted,
            });

            // Таймаут без ответа
            timeoutRef.current = setTimeout(() => {
                if (stateRef.current.status === 'calling') {
                    wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'timeout' }));
                    cleanup();
                }
            }, CALL_TIMEOUT_MS);

        } catch (e: any) {
            console.error('[Call] Start failed:', e);
            cleanup();
            setCallState({ ...INITIAL, status: 'ended', endReason: 'error' });
        }
    }, [createPC, getAudioStream, getPeerInfo, cleanup]);

    // ═══════════════════════════════════════════════════════
    //  Принять звонок (входящий)
    // ═══════════════════════════════════════════════════════

    const answerCall = useCallback(async () => {
        const offer = pendingOfferRef.current;
        if (!offer || stateRef.current.status !== 'ringing') return;

        stopRingtone();

        try {
            const stream = await getAudioStream();
            const pc = createPC(offer.chatId, offer.callId);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const sdp = await decryptSignaling(offer.chatId, offer.sdp, offer.encrypted);
            await pc.setRemoteDescription({ type: 'offer', sdp });
            await flushPendingCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const enc = await encryptSignaling(offer.chatId, answer.sdp!);

            wsManager.send({
                type: 'call_answer',
                payload: {
                    chat_id: offer.chatId,
                    call_id: offer.callId,
                    sdp: enc.data,
                    encrypted: enc.encrypted,
                },
            });

            setCallState(s => ({ ...s, status: 'connecting' }));

        } catch (e: any) {
            console.error('[Call] Answer failed:', e);
            cleanup();
            setCallState({ ...INITIAL, status: 'ended', endReason: 'error' });
        }
    }, [createPC, getAudioStream, flushPendingCandidates, cleanup, stopRingtone]);

    // ═══════════════════════════════════════════════════════
    //  Отклонить звонок
    // ═══════════════════════════════════════════════════════

    const rejectCall = useCallback(() => {
        const offer = pendingOfferRef.current;
        if (!offer) return;
        stopRingtone();
        wsManager.send({
            type: 'call_reject',
            payload: { chat_id: offer.chatId, call_id: offer.callId },
        });
        pendingOfferRef.current = null;
        setCallState(INITIAL);
    }, [stopRingtone]);

    // ═══════════════════════════════════════════════════════
    //  Повесить трубку
    // ═══════════════════════════════════════════════════════

    const hangup = useCallback(() => {
        const { chatId, callId } = stateRef.current;
        if (chatId && callId) {
            wsManager.send({
                type: 'call_hangup',
                payload: { chat_id: chatId, call_id: callId },
            });
        }
        cleanup();
        setCallState({ ...INITIAL, status: 'ended', endReason: 'hangup' });
    }, [cleanup]);

    // ═══════════════════════════════════════════════════════
    //  Вкл/выкл микрофон
    // ═══════════════════════════════════════════════════════

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const track = stream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        setCallState(s => ({ ...s, isMuted: !track.enabled }));
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Сбросить состояние (после показа "ended")
    // ═══════════════════════════════════════════════════════

    const dismissCall = useCallback(() => {
        setCallState(INITIAL);
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Обработка WS-сообщений
    // ═══════════════════════════════════════════════════════

    useEffect(() => {
        const unsub = wsManager.subscribe(async (msg: WsServerMsg) => {
            switch (msg.type) {
                // ── Входящий звонок ──
                case 'call_incoming': {
                    const { chat_id, call_id, caller_id, caller_name, sdp, encrypted } = msg.payload;
                    // Если уже в звонке — отклоняем
                    if (stateRef.current.status !== 'idle') {
                        wsManager.send({ type: 'call_reject', payload: { chat_id, call_id } });
                        return;
                    }
                    const chat = chatsRef.current.find(c => c.id === chat_id);
                    const callerMember = chat?.members.find(m => m.user_id === caller_id);

                    pendingOfferRef.current = { chatId: chat_id, callId: call_id, sdp, encrypted, callerId: caller_id, callerName: caller_name };

                    setCallState({
                        status: 'ringing',
                        chatId: chat_id,
                        callId: call_id,
                        peerId: caller_id,
                        peerName: caller_name,
                        peerAvatarUrl: callerMember?.avatar_url,
                        isMuted: false,
                        duration: 0,
                        isEncrypted: encrypted,
                    });
                    startRingtone();

                    // Автоотбой через 35 сек если не ответили
                    timeoutRef.current = setTimeout(() => {
                        if (stateRef.current.status === 'ringing') {
                            rejectCall();
                        }
                    }, CALL_TIMEOUT_MS);
                    break;
                }

                // ── Собеседник принял звонок ──
                case 'call_accepted': {
                    const { call_id, sdp, encrypted, chat_id } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

                    try {
                        const pc = pcRef.current;
                        if (!pc) return;
                        const realSdp = await decryptSignaling(chat_id, sdp, encrypted);
                        await pc.setRemoteDescription({ type: 'answer', sdp: realSdp });
                        await flushPendingCandidates();
                        setCallState(s => ({ ...s, status: 'connecting' }));
                    } catch (e) {
                        console.error('[Call] Set answer failed:', e);
                        hangup();
                    }
                    break;
                }

                // ── ICE кандидат ──
                case 'call_ice': {
                    const { call_id, candidate, encrypted: enc, chat_id } = msg.payload;
                    if (stateRef.current.callId !== call_id && pendingOfferRef.current?.callId !== call_id) return;

                    try {
                        const chatId = stateRef.current.chatId || pendingOfferRef.current?.chatId || chat_id;
                        const raw = await decryptSignaling(chatId, candidate, enc);
                        const parsed = JSON.parse(raw);
                        const iceCandidate = parsed as RTCIceCandidateInit;

                        const pc = pcRef.current;
                        if (pc && pc.remoteDescription) {
                            await pc.addIceCandidate(iceCandidate);
                        } else {
                            pendingCandidatesRef.current.push(iceCandidate);
                        }
                    } catch (e) {
                        console.warn('[Call] ICE candidate error:', e);
                    }
                    break;
                }

                // ── Собеседник отклонил звонок ──
                case 'call_rejected': {
                    const { call_id } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    cleanup();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'rejected' }));
                    break;
                }

                // ── Собеседник завершил звонок ──
                case 'call_ended': {
                    const { call_id } = msg.payload;
                    if (stateRef.current.callId !== call_id && pendingOfferRef.current?.callId !== call_id) return;
                    stopRingtone();
                    cleanup();
                    setCallState(s => {
                        if (s.status === 'idle') return s;
                        return { ...s, status: 'ended', endReason: 'hangup' };
                    });
                    break;
                }
            }
        });
        return unsub;
    }, [currentUserId, cleanup, flushPendingCandidates, hangup, rejectCall, startRingtone, stopRingtone]);

    // ── Cleanup при размонтировании ──────────────────────

    useEffect(() => {
        return () => {
            cleanup();
            stopRingtone();
        };
    }, [cleanup, stopRingtone]);

    return {
        callState,
        startCall,
        answerCall,
        rejectCall,
        hangup,
        toggleMute,
        dismissCall,
    };
}