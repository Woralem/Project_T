import { useState, useCallback, useRef, useEffect } from 'react';
import type { CallState, LocalChat, WsServerMsg } from '../types';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';

const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
    ],
    iceCandidatePoolSize: 4,
};

const CALL_TIMEOUT_MS = 35_000;
const CONNECTING_TIMEOUT_MS = 20_000;

const INITIAL: CallState = {
    status: 'idle',
    chatId: null,
    callId: null,
    peerId: null,
    peerName: null,
    isMuted: false,
    peerMuted: false,
    duration: 0,
    isEncrypted: false,
    peerVolume: 100,
    micGain: 100,
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

// ── Рингтон ──────────────────────────────────────────────

function createRingtonePlayer() {
    let audio: HTMLAudioElement | null = null;

    function start(type: 'incoming' | 'outgoing') {
        stop();
        const src = type === 'incoming' ? '/sounds/ringtone.mp3' : '/sounds/ringback.mp3';
        audio = new Audio(src);
        audio.loop = true;
        audio.volume = type === 'incoming' ? 0.7 : 0.4;
        audio.play().catch(() => { });
    }

    function stop() {
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.src = '';
            audio = null;
        }
    }

    return { start, stop };
}

// ══════════════════════════════════════════════════════════

export function useCall(currentUserId: string, chats: LocalChat[]) {
    const [callState, setCallState] = useState<CallState>(INITIAL);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingOfferRef = useRef<PendingOffer | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const ringtoneRef = useRef(createRingtonePlayer());
    const connectedFiredRef = useRef(false);

    // Audio processing
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);

    const stateRef = useRef(callState);
    stateRef.current = callState;
    const chatsRef = useRef(chats);
    chatsRef.current = chats;

    // ── Remote audio ─────────────────────────────────────

    useEffect(() => {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current = audio;
        return () => { audio.srcObject = null; };
    }, []);

    // ── Утилиты ──────────────────────────────────────────

    const clearAllTimeouts = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (connectingTimeoutRef.current) { clearTimeout(connectingTimeoutRef.current); connectingTimeoutRef.current = null; }
    }, []);

    const cleanup = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        clearAllTimeouts();
        ringtoneRef.current.stop();
        connectedFiredRef.current = false;

        pcRef.current?.close();
        pcRef.current = null;

        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;

        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => { });
        }
        audioCtxRef.current = null;
        gainNodeRef.current = null;

        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        pendingOfferRef.current = null;
        pendingCandidatesRef.current = [];
    }, [clearAllTimeouts]);

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

    // ── Обработка подключения (вызывается один раз) ──────

    const handleConnected = useCallback((chatId: string) => {
        if (connectedFiredRef.current) return;
        connectedFiredRef.current = true;

        console.log('[Call] ✓ Connected!');
        clearAllTimeouts();
        ringtoneRef.current.stop();

        const isEnc = cryptoManager.hasChatKey(chatId);
        setCallState(s => ({ ...s, status: 'connected', isEncrypted: isEnc }));
        startTimer();
    }, [clearAllTimeouts, startTimer]);

    // ── Обработка отключения ─────────────────────────────

    const handleDisconnected = useCallback(() => {
        const st = stateRef.current.status;
        if (st === 'idle' || st === 'ended') return;

        console.log('[Call] ✗ Disconnected/Failed');
        ringtoneRef.current.stop();
        cleanup();
        setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
    }, [cleanup]);

    // ── Таймаут connecting ───────────────────────────────

    const startConnectingTimeout = useCallback((chatId: string, callId: string) => {
        if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);

        connectingTimeoutRef.current = setTimeout(() => {
            if (stateRef.current.status === 'connecting') {
                console.warn('[Call] Connecting timeout');
                wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                cleanup();
                setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
            }
        }, CONNECTING_TIMEOUT_MS);
    }, [cleanup]);

    // ── Создание PeerConnection ─────────────────────────

    const createPC = useCallback((chatId: string, callId: string) => {
        const pc = new RTCPeerConnection(ICE_CONFIG);

        pc.onicecandidate = async (e) => {
            if (!e.candidate) return;
            const candidateStr = JSON.stringify(e.candidate.toJSON());
            const enc = await encryptSignaling(chatId, candidateStr);
            wsManager.send({
                type: 'call_ice',
                payload: { chat_id: chatId, call_id: callId, candidate: enc.data, encrypted: enc.encrypted },
            });
        };

        pc.ontrack = (e) => {
            console.log('[Call] Remote track received');
            if (remoteAudioRef.current && e.streams[0]) {
                remoteAudioRef.current.srcObject = e.streams[0];
                remoteAudioRef.current.volume = (stateRef.current.peerVolume ?? 100) / 100;
            }
        };

        // ── Двойное отслеживание: connectionState + iceConnectionState ──

        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            console.log('[Call] connectionState:', st);

            if (st === 'connected') {
                handleConnected(chatId);
            } else if (st === 'failed') {
                handleDisconnected();
            }
            // 'disconnected' может быть временным — не реагируем сразу
        };

        pc.oniceconnectionstatechange = () => {
            const st = pc.iceConnectionState;
            console.log('[Call] iceConnectionState:', st);

            if (st === 'connected' || st === 'completed') {
                handleConnected(chatId);
            } else if (st === 'failed') {
                handleDisconnected();
            } else if (st === 'disconnected') {
                // Ждём 5 секунд — может восстановится
                setTimeout(() => {
                    if (pcRef.current && pcRef.current.iceConnectionState === 'disconnected') {
                        console.warn('[Call] ICE still disconnected after 5s');
                        handleDisconnected();
                    }
                }, 5000);
            }
        };

        pc.onicegatheringstatechange = () => {
            console.log('[Call] iceGatheringState:', pc.iceGatheringState);
        };

        pcRef.current = pc;
        return pc;
    }, [handleConnected, handleDisconnected]);

    // ── Получить аудио-поток с GainNode ──────────────────

    const getAudioStream = useCallback(async (initialGain: number): Promise<MediaStream> => {
        const originalStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });

        localStreamRef.current = originalStream;

        try {
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(originalStream);
            const gain = ctx.createGain();
            gain.gain.value = (initialGain / 100) * 2;
            gainNodeRef.current = gain;
            const dest = ctx.createMediaStreamDestination();
            source.connect(gain).connect(dest);
            return dest.stream;
        } catch (e) {
            console.warn('[Call] AudioContext failed, using raw stream:', e);
            return originalStream;
        }
    }, []);

    // ── Flush pending ICE candidates ─────────────────────

    const flushPendingCandidates = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) return;

        const candidates = [...pendingCandidatesRef.current];
        pendingCandidatesRef.current = [];

        console.log(`[Call] Flushing ${candidates.length} pending ICE candidates`);

        for (const c of candidates) {
            try {
                await pc.addIceCandidate(c);
            } catch (e) {
                console.warn('[Call] addIceCandidate failed:', e);
            }
        }
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Начать звонок (исходящий)
    // ═══════════════════════════════════════════════════════

    const startCall = useCallback(async (chatId: string) => {
        const st = stateRef.current.status;
        // Разрешаем начать только из idle или ended
        if (st !== 'idle' && st !== 'ended') return;

        // Если были в ended — сбрасываем
        if (st === 'ended') cleanup();

        const callId = crypto.randomUUID();
        const peer = getPeerInfo(chatId);

        try {
            const stream = await getAudioStream(100);
            const pc = createPC(chatId, callId);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const enc = await encryptSignaling(chatId, offer.sdp!);

            wsManager.send({
                type: 'call_offer',
                payload: { chat_id: chatId, call_id: callId, sdp: enc.data, encrypted: enc.encrypted },
            });

            setCallState({
                status: 'calling', chatId, callId,
                peerId: null, peerName: peer.name, peerAvatarUrl: peer.avatarUrl,
                isMuted: false, peerMuted: false,
                duration: 0, isEncrypted: enc.encrypted,
                peerVolume: 100, micGain: 100,
            });

            ringtoneRef.current.start('outgoing');

            // Таймаут ожидания ответа
            callTimeoutRef.current = setTimeout(() => {
                if (stateRef.current.status === 'calling') {
                    console.log('[Call] Ring timeout');
                    wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                    cleanup();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'timeout' }));
                }
            }, CALL_TIMEOUT_MS);

        } catch (e: any) {
            console.error('[Call] Start failed:', e);
            cleanup();
            setCallState(s => ({
                ...s,
                peerName: s.peerName || peer.name,
                status: 'ended',
                endReason: 'error',
            }));
        }
    }, [createPC, getAudioStream, getPeerInfo, cleanup]);

    // ═══════════════════════════════════════════════════════
    //  Принять звонок (входящий)
    // ═══════════════════════════════════════════════════════

    const answerCall = useCallback(async () => {
        const offer = pendingOfferRef.current;
        if (!offer || stateRef.current.status !== 'ringing') return;

        // ← ФИКС: очищаем таймер автоотклонения
        clearAllTimeouts();
        ringtoneRef.current.stop();

        try {
            const stream = await getAudioStream(100);
            const pc = createPC(offer.chatId, offer.callId);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const sdp = await decryptSignaling(offer.chatId, offer.sdp, offer.encrypted);
            await pc.setRemoteDescription({ type: 'offer', sdp });

            // ← Flush ПОСЛЕ setRemoteDescription
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

            setCallState(s => ({ ...s, status: 'connecting', peerVolume: 100, micGain: 100 }));

            // ← Таймаут на фазу connecting
            startConnectingTimeout(offer.chatId, offer.callId);

        } catch (e: any) {
            console.error('[Call] Answer failed:', e);
            cleanup();
            setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
        }
    }, [createPC, getAudioStream, flushPendingCandidates, cleanup, clearAllTimeouts, startConnectingTimeout]);

    // ═══════════════════════════════════════════════════════
    //  Отклонить
    // ═══════════════════════════════════════════════════════

    const rejectCall = useCallback(() => {
        const offer = pendingOfferRef.current;
        if (!offer) return;

        clearAllTimeouts();
        ringtoneRef.current.stop();

        wsManager.send({ type: 'call_reject', payload: { chat_id: offer.chatId, call_id: offer.callId } });
        pendingOfferRef.current = null;
        setCallState(INITIAL);
    }, [clearAllTimeouts]);

    // ═══════════════════════════════════════════════════════
    //  Повесить трубку
    // ═══════════════════════════════════════════════════════

    const hangup = useCallback(() => {
        const { chatId, callId } = stateRef.current;
        if (chatId && callId) {
            wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
        }
        cleanup();
        setCallState(s => ({ ...s, status: 'ended', endReason: 'hangup' }));
    }, [cleanup]);

    // ═══════════════════════════════════════════════════════
    //  Мьют + уведомление собеседнику
    // ═══════════════════════════════════════════════════════

    const toggleMute = useCallback(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const track = stream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        const newMuted = !track.enabled;

        setCallState(s => ({ ...s, isMuted: newMuted }));

        const { chatId, callId } = stateRef.current;
        if (chatId && callId) {
            wsManager.send({
                type: 'call_mute',
                payload: { chat_id: chatId, call_id: callId, muted: newMuted },
            });
        }
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Громкость
    // ═══════════════════════════════════════════════════════

    const setPeerVolume = useCallback((value: number) => {
        const v = Math.max(0, Math.min(100, value));
        if (remoteAudioRef.current) remoteAudioRef.current.volume = v / 100;
        setCallState(s => ({ ...s, peerVolume: v }));
    }, []);

    const setMicGain = useCallback((value: number) => {
        const v = Math.max(0, Math.min(100, value));
        if (gainNodeRef.current) gainNodeRef.current.gain.value = (v / 100) * 2;
        setCallState(s => ({ ...s, micGain: v }));
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Dismiss
    // ═══════════════════════════════════════════════════════

    const dismissCall = useCallback(() => {
        setCallState(INITIAL);
    }, []);

    // ═══════════════════════════════════════════════════════
    //  WebSocket
    // ═══════════════════════════════════════════════════════

    useEffect(() => {
        const unsub = wsManager.subscribe(async (msg: WsServerMsg) => {
            switch (msg.type) {
                // ── Входящий звонок ──────────────────────
                case 'call_incoming': {
                    const { chat_id, call_id, caller_id, caller_name, sdp, encrypted } = msg.payload;

                    const st = stateRef.current.status;

                    // ← ФИКС: если в 'ended' — просто сбрасываем, не отклоняем
                    if (st === 'ended') {
                        cleanup();
                        // Продолжаем дальше к приёму звонка
                    } else if (st !== 'idle') {
                        // Реально заняты (calling/ringing/connecting/connected)
                        wsManager.send({ type: 'call_reject', payload: { chat_id, call_id } });
                        return;
                    }

                    const chat = chatsRef.current.find(c => c.id === chat_id);
                    const callerMember = chat?.members.find(m => m.user_id === caller_id);

                    pendingOfferRef.current = {
                        chatId: chat_id, callId: call_id, sdp, encrypted,
                        callerId: caller_id, callerName: caller_name,
                    };

                    setCallState({
                        status: 'ringing', chatId: chat_id, callId: call_id,
                        peerId: caller_id, peerName: caller_name,
                        peerAvatarUrl: callerMember?.avatar_url,
                        isMuted: false, peerMuted: false,
                        duration: 0, isEncrypted: encrypted,
                        peerVolume: 100, micGain: 100,
                    });

                    ringtoneRef.current.start('incoming');

                    callTimeoutRef.current = setTimeout(() => {
                        if (stateRef.current.status === 'ringing') {
                            rejectCall();
                        }
                    }, CALL_TIMEOUT_MS);
                    break;
                }

                // ── Собеседник принял ────────────────────
                case 'call_accepted': {
                    const { call_id, sdp, encrypted, chat_id } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;

                    // ← Очищаем ВСЕ таймауты
                    clearAllTimeouts();
                    ringtoneRef.current.stop();

                    try {
                        const pc = pcRef.current;
                        if (!pc) return;

                        const realSdp = await decryptSignaling(chat_id, sdp, encrypted);
                        await pc.setRemoteDescription({ type: 'answer', sdp: realSdp });

                        // ← Flush после setRemoteDescription
                        await flushPendingCandidates();

                        setCallState(s => ({ ...s, status: 'connecting' }));

                        // ← Таймаут на фазу connecting
                        startConnectingTimeout(chat_id, call_id);
                    } catch (e) {
                        console.error('[Call] Set answer failed:', e);
                        hangup();
                    }
                    break;
                }

                // ── ICE кандидат ─────────────────────────
                case 'call_ice': {
                    const { call_id, candidate, encrypted: enc, chat_id } = msg.payload;

                    // Принимаем кандидаты для нашего звонка ИЛИ для pending offer
                    const isOurCall = stateRef.current.callId === call_id;
                    const isPendingCall = pendingOfferRef.current?.callId === call_id;
                    if (!isOurCall && !isPendingCall) return;

                    try {
                        const chatId = stateRef.current.chatId || pendingOfferRef.current?.chatId || chat_id;
                        const raw = await decryptSignaling(chatId, candidate, enc);
                        const parsed = JSON.parse(raw) as RTCIceCandidateInit;

                        const pc = pcRef.current;
                        if (pc && pc.remoteDescription) {
                            await pc.addIceCandidate(parsed);
                        } else {
                            // Буферизуем если PC ещё нет или remoteDescription не установлен
                            pendingCandidatesRef.current.push(parsed);
                        }
                    } catch (e) {
                        console.warn('[Call] ICE candidate error:', e);
                    }
                    break;
                }

                // ── Отклонён ─────────────────────────────
                case 'call_rejected': {
                    const { call_id } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    cleanup();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'rejected' }));
                    break;
                }

                // ── Завершён ─────────────────────────────
                case 'call_ended': {
                    const { call_id } = msg.payload;
                    const isOurCall = stateRef.current.callId === call_id;
                    const isPendingCall = pendingOfferRef.current?.callId === call_id;
                    if (!isOurCall && !isPendingCall) return;

                    cleanup();
                    setCallState(s => {
                        if (s.status === 'idle') return s;
                        return { ...s, status: 'ended', endReason: 'hangup' };
                    });
                    break;
                }

                // ── Мьют собеседника ─────────────────────
                case 'call_mute_changed': {
                    const { call_id, muted } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    setCallState(s => ({ ...s, peerMuted: muted }));
                    break;
                }
            }
        });
        return unsub;
    }, [currentUserId, cleanup, flushPendingCandidates, hangup, rejectCall, clearAllTimeouts, startConnectingTimeout]);

    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    return {
        callState,
        startCall, answerCall, rejectCall, hangup,
        toggleMute, setPeerVolume, setMicGain, dismissCall,
    };
}