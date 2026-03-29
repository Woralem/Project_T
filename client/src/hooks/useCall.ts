import { useState, useCallback, useRef, useEffect } from 'react';
import type { CallState, LocalChat, WsServerMsg, SharedMediaItem } from '../types';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';

// ══════════════════════════════════════════════════════════
//  Конфигурация
// ══════════════════════════════════════════════════════════

const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // ── TURN-сервер на вашем VPS (поменяйте пароль!) ──
        {
            urls: [
                'turn:163.5.180.138:3478',
                'turn:163.5.180.138:3478?transport=tcp',
            ],
            username: 'messenger',
            credential: 'YourSecretTurnPassword2024',
        },
    ],
    iceCandidatePoolSize: 4,
    iceTransportPolicy: 'all',
};

const CALL_TIMEOUT_MS = 35_000;
const CONNECTING_TIMEOUT_MS = 15_000;
const ICE_DISCONNECTED_TIMEOUT_MS = 7_000;
const ICE_RESTART_MAX = 2;

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
    sharedMedia: [],
    showMediaPanel: false,
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

async function encryptSignaling(
    chatId: string, data: string,
): Promise<{ data: string; encrypted: boolean }> {
    if (!cryptoManager.hasChatKey(chatId)) return { data, encrypted: false };
    try {
        const payload = await cryptoManager.encrypt(chatId, data);
        return { data: JSON.stringify(payload), encrypted: true };
    } catch {
        return { data, encrypted: false };
    }
}

async function decryptSignaling(
    chatId: string, data: string, isEncrypted: boolean,
): Promise<string> {
    if (!isEncrypted) return data;
    try {
        const payload = JSON.parse(data);
        return await cryptoManager.decrypt(chatId, payload.ciphertext, payload.nonce);
    } catch (e) {
        console.warn('[Call] Decrypt signaling failed:', e);
        return data;
    }
}

// ── Рингтон ──────────────────────────────────────────────

function createRingtonePlayer() {
    let audio: HTMLAudioElement | null = null;
    return {
        start(type: 'incoming' | 'outgoing') {
            this.stop();
            audio = new Audio(type === 'incoming' ? '/sounds/ringtone.mp3' : '/sounds/ringback.mp3');
            audio.loop = true;
            audio.volume = type === 'incoming' ? 0.7 : 0.4;
            audio.play().catch(() => { });
        },
        stop() {
            if (audio) { audio.pause(); audio.currentTime = 0; audio.src = ''; audio = null; }
        },
    };
}

// ══════════════════════════════════════════════════════════

export function useCall(currentUserId: string, chats: LocalChat[]) {
    const [callState, setCallState] = useState<CallState>(INITIAL);

    // ── Refs ─────────────────────────────────────────────

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const iceDisconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingOfferRef = useRef<PendingOffer | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const ringtoneRef = useRef(createRingtonePlayer());
    const connectedFiredRef = useRef(false);
    const iceRestartCountRef = useRef(0);

    // Audio processing
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);

    // Стабильные refs для данных
    const stateRef = useRef(callState);
    stateRef.current = callState;
    const chatsRef = useRef(chats);
    chatsRef.current = chats;
    const currentUserIdRef = useRef(currentUserId);
    currentUserIdRef.current = currentUserId;

    // ── Remote audio element ─────────────────────────────

    useEffect(() => {
        const audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current = audio;
        return () => { audio.srcObject = null; };
    }, []);

    // ── clearAllTimeouts ─────────────────────────────────

    const clearAllTimeouts = useCallback(() => {
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (connectingTimeoutRef.current) { clearTimeout(connectingTimeoutRef.current); connectingTimeoutRef.current = null; }
        if (iceDisconnectTimeoutRef.current) { clearTimeout(iceDisconnectTimeoutRef.current); iceDisconnectTimeoutRef.current = null; }
    }, []);

    // ── cleanup ──────────────────────────────────────────

    const cleanup = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        clearAllTimeouts();
        ringtoneRef.current.stop();
        connectedFiredRef.current = false;
        iceRestartCountRef.current = 0;

        if (pcRef.current) {
            pcRef.current.onicecandidate = null;
            pcRef.current.ontrack = null;
            pcRef.current.onconnectionstatechange = null;
            pcRef.current.oniceconnectionstatechange = null;
            pcRef.current.onicegatheringstatechange = null;
            pcRef.current.close();
            pcRef.current = null;
        }

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

    // ── Refs для callback'ов (для стабильного subscriber) ──

    const cleanupRef = useRef(cleanup);
    cleanupRef.current = cleanup;
    const clearAllTimeoutsRef = useRef(clearAllTimeouts);
    clearAllTimeoutsRef.current = clearAllTimeouts;

    // ── Helpers ──────────────────────────────────────────

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
            const other = chat.members.find(m => m.user_id !== currentUserIdRef.current);
            return { name: other?.display_name || chat.name, avatarUrl: other?.avatar_url };
        }
        return { name: chat.name };
    }, []);

    const flushPendingCandidates = useCallback(async () => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) return;
        const candidates = [...pendingCandidatesRef.current];
        pendingCandidatesRef.current = [];
        console.log(`[Call] Flushing ${candidates.length} buffered ICE candidates`);
        for (const c of candidates) {
            try { await pc.addIceCandidate(c); } catch (e) { console.warn('[Call] addIceCandidate:', e); }
        }
    }, []);

    // ── ICE restart ──────────────────────────────────────

    const tryIceRestart = useCallback(async () => {
        const pc = pcRef.current;
        const { chatId, callId, status } = stateRef.current;
        if (!pc || !chatId || !callId) return;
        if (status !== 'connected' && status !== 'connecting') return;
        if (iceRestartCountRef.current >= ICE_RESTART_MAX) {
            console.warn('[Call] Max ICE restarts reached');
            return;
        }

        iceRestartCountRef.current++;
        console.log(`[Call] ICE restart #${iceRestartCountRef.current}`);

        try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            const enc = await encryptSignaling(chatId, offer.sdp!);
            wsManager.send({
                type: 'call_offer',
                payload: { chat_id: chatId, call_id: callId, sdp: enc.data, encrypted: enc.encrypted },
            });
        } catch (e) {
            console.error('[Call] ICE restart failed:', e);
        }
    }, []);

    // ── Get audio stream with GainNode ───────────────────

    const getAudioStream = useCallback(async (): Promise<MediaStream> => {
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
            gain.gain.value = 1.0;
            gainNodeRef.current = gain;
            const dest = ctx.createMediaStreamDestination();
            source.connect(gain).connect(dest);
            return dest.stream;
        } catch {
            return originalStream;
        }
    }, []);

    // ── Create PeerConnection ────────────────────────────

    const createPC = useCallback((chatId: string, callId: string): RTCPeerConnection => {
        const pc = new RTCPeerConnection(ICE_CONFIG);

        pc.onicecandidate = async (e) => {
            if (!e.candidate) {
                console.log('[Call] ICE gathering complete');
                return;
            }
            try {
                const candidateStr = JSON.stringify(e.candidate.toJSON());
                const enc = await encryptSignaling(chatId, candidateStr);
                wsManager.send({
                    type: 'call_ice',
                    payload: { chat_id: chatId, call_id: callId, candidate: enc.data, encrypted: enc.encrypted },
                });
            } catch (e) {
                console.warn('[Call] Send ICE candidate failed:', e);
            }
        };

        pc.ontrack = (e) => {
            console.log('[Call] Remote track received');
            if (remoteAudioRef.current && e.streams[0]) {
                remoteAudioRef.current.srcObject = e.streams[0];
                remoteAudioRef.current.volume = (stateRef.current.peerVolume ?? 100) / 100;
            }
        };

        const markConnected = () => {
            if (connectedFiredRef.current) return;
            connectedFiredRef.current = true;
            console.log('[Call] ✓ CONNECTED');
            clearAllTimeoutsRef.current();
            ringtoneRef.current.stop();
            iceRestartCountRef.current = 0;
            const isEnc = cryptoManager.hasChatKey(chatId);
            setCallState(s => ({ ...s, status: 'connected', isEncrypted: isEnc }));
            if (!timerRef.current) {
                timerRef.current = setInterval(() => {
                    setCallState(s => ({ ...s, duration: s.duration + 1 }));
                }, 1000);
            }
        };

        const markFailed = () => {
            const st = stateRef.current.status;
            if (st === 'idle' || st === 'ended') return;
            console.log('[Call] ✗ FAILED');
            cleanupRef.current();
            setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
        };

        // Двойное отслеживание: connectionState + iceConnectionState
        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            console.log('[Call] connectionState:', st);
            if (st === 'connected') markConnected();
            else if (st === 'failed') markFailed();
        };

        pc.oniceconnectionstatechange = () => {
            const st = pc.iceConnectionState;
            console.log('[Call] iceConnectionState:', st);

            if (st === 'connected' || st === 'completed') {
                markConnected();
                // Сбрасываем таймер disconnected
                if (iceDisconnectTimeoutRef.current) {
                    clearTimeout(iceDisconnectTimeoutRef.current);
                    iceDisconnectTimeoutRef.current = null;
                }
            } else if (st === 'failed') {
                // Пробуем ICE restart перед отключением
                if (iceRestartCountRef.current < ICE_RESTART_MAX) {
                    tryIceRestart();
                } else {
                    markFailed();
                }
            } else if (st === 'disconnected') {
                // Ждём — может восстановится
                if (iceDisconnectTimeoutRef.current) clearTimeout(iceDisconnectTimeoutRef.current);
                iceDisconnectTimeoutRef.current = setTimeout(() => {
                    const currentSt = pcRef.current?.iceConnectionState;
                    if (currentSt === 'disconnected' || currentSt === 'failed') {
                        console.warn('[Call] ICE still disconnected, trying restart');
                        if (iceRestartCountRef.current < ICE_RESTART_MAX) {
                            tryIceRestart();
                        } else {
                            markFailed();
                        }
                    }
                }, ICE_DISCONNECTED_TIMEOUT_MS);
            }
        };

        pc.onicegatheringstatechange = () => {
            console.log('[Call] iceGatheringState:', pc.iceGatheringState);
        };

        pcRef.current = pc;
        return pc;
    }, [tryIceRestart]);

    // ═══════════════════════════════════════════════════════
    //  startCall
    // ═══════════════════════════════════════════════════════

    const startCall = useCallback(async (chatId: string) => {
        const st = stateRef.current.status;
        if (st !== 'idle' && st !== 'ended') return;
        if (st === 'ended') cleanup();

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
                payload: { chat_id: chatId, call_id: callId, sdp: enc.data, encrypted: enc.encrypted },
            });

            setCallState({
                status: 'calling', chatId, callId,
                peerId: null, peerName: peer.name, peerAvatarUrl: peer.avatarUrl,
                isMuted: false, peerMuted: false,
                duration: 0, isEncrypted: enc.encrypted,
                peerVolume: 100, micGain: 100,
                sharedMedia: [], showMediaPanel: false,
            });

            ringtoneRef.current.start('outgoing');

            callTimeoutRef.current = setTimeout(() => {
                if (stateRef.current.status === 'calling') {
                    wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                    cleanup();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'timeout' }));
                }
            }, CALL_TIMEOUT_MS);

        } catch (e: any) {
            console.error('[Call] Start failed:', e);
            cleanup();
            setCallState(s => ({ ...s, peerName: s.peerName || peer.name, status: 'ended', endReason: 'error' }));
        }
    }, [createPC, getAudioStream, getPeerInfo, cleanup]);

    // ═══════════════════════════════════════════════════════
    //  answerCall
    // ═══════════════════════════════════════════════════════

    const answerCall = useCallback(async () => {
        const offer = pendingOfferRef.current;
        if (!offer || stateRef.current.status !== 'ringing') return;

        clearAllTimeouts();
        ringtoneRef.current.stop();

        setCallState(s => ({ ...s, status: 'connecting' }));

        try {
            const stream = await getAudioStream();
            const pc = createPC(offer.chatId, offer.callId);
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const sdp = await decryptSignaling(offer.chatId, offer.sdp, offer.encrypted);

            console.log('[Call] Setting remote offer SDP');
            await pc.setRemoteDescription({ type: 'offer', sdp });

            console.log('[Call] Flushing candidates after setRemoteDescription');
            await flushPendingCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const enc = await encryptSignaling(offer.chatId, answer.sdp!);

            console.log('[Call] Sending call_answer');
            wsManager.send({
                type: 'call_answer',
                payload: { chat_id: offer.chatId, call_id: offer.callId, sdp: enc.data, encrypted: enc.encrypted },
            });

            connectingTimeoutRef.current = setTimeout(() => {
                if (stateRef.current.status === 'connecting') {
                    console.warn('[Call] Connecting timeout (answerer)');
                    const { chatId, callId } = stateRef.current;
                    if (chatId && callId) {
                        wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                    }
                    cleanup();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
                }
            }, CONNECTING_TIMEOUT_MS);

        } catch (e: any) {
            console.error('[Call] Answer failed:', e);
            cleanup();
            setCallState(s => ({ ...s, status: 'ended', endReason: 'error' }));
        }
    }, [createPC, getAudioStream, flushPendingCandidates, cleanup, clearAllTimeouts]);

    // ═══════════════════════════════════════════════════════
    //  rejectCall
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
    //  hangup
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
    //  toggleMute
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
            wsManager.send({ type: 'call_mute', payload: { chat_id: chatId, call_id: callId, muted: newMuted } });
        }
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Volume controls
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
    //  dismiss
    // ═══════════════════════════════════════════════════════

    const dismissCall = useCallback(() => { setCallState(INITIAL); }, []);

    // ═══════════════════════════════════════════════════════
    //  Shared Media
    // ═══════════════════════════════════════════════════════

    const toggleMediaPanel = useCallback(() => {
        setCallState(s => ({ ...s, showMediaPanel: !s.showMediaPanel }));
    }, []);

    const shareMedia = useCallback((fileId: string, fileName: string) => {
        const { chatId, callId } = stateRef.current;
        if (!chatId || !callId) return;
        wsManager.send({
            type: 'call_media_share',
            payload: { chat_id: chatId, call_id: callId, file_id: fileId, file_name: fileName },
        });
    }, []);

    const removeMedia = useCallback((mediaId: string) => {
        const { chatId, callId } = stateRef.current;
        if (!chatId || !callId) return;
        setCallState(s => ({ ...s, sharedMedia: s.sharedMedia.filter(m => m.id !== mediaId) }));
        wsManager.send({
            type: 'call_media_remove',
            payload: { chat_id: chatId, call_id: callId, media_id: mediaId },
        });
    }, []);

    const controlMedia = useCallback((mediaId: string, action: 'play' | 'pause' | 'seek', time?: number) => {
        const { chatId, callId } = stateRef.current;
        if (!chatId || !callId) return;

        setCallState(s => ({
            ...s,
            sharedMedia: s.sharedMedia.map(m => {
                if (m.id !== mediaId) return m;
                if (action === 'play') return { ...m, isPlaying: true };
                if (action === 'pause') return { ...m, isPlaying: false };
                if (action === 'seek' && time !== undefined) return { ...m, currentTime: time };
                return m;
            }),
        }));

        const item = stateRef.current.sharedMedia.find(m => m.id === mediaId);
        wsManager.send({
            type: 'call_media_control',
            payload: {
                chat_id: chatId, call_id: callId, media_id: mediaId,
                action, current_time: time ?? item?.currentTime ?? 0,
            },
        });
    }, []);

    const setMediaVolume = useCallback((mediaId: string, volume: number) => {
        setCallState(s => ({
            ...s,
            sharedMedia: s.sharedMedia.map(m =>
                m.id !== mediaId ? m : { ...m, localVolume: volume, localMuted: false }
            ),
        }));
    }, []);

    const toggleMediaMute = useCallback((mediaId: string) => {
        setCallState(s => ({
            ...s,
            sharedMedia: s.sharedMedia.map(m =>
                m.id !== mediaId ? m : { ...m, localMuted: !m.localMuted }
            ),
        }));
    }, []);

    const updateMediaTitle = useCallback((mediaId: string, title: string) => {
        setCallState(s => ({
            ...s,
            sharedMedia: s.sharedMedia.map(m => m.id !== mediaId ? m : { ...m, title }),
        }));
    }, []);

    const updateMediaTime = useCallback((mediaId: string, currentTime: number, duration: number) => {
        setCallState(s => ({
            ...s,
            sharedMedia: s.sharedMedia.map(m =>
                m.id !== mediaId ? m : { ...m, currentTime, duration: duration || m.duration }
            ),
        }));
    }, []);

    // ═══════════════════════════════════════════════════════
    //  Refs для всех callback'ов → стабильная подписка
    // ═══════════════════════════════════════════════════════

    const answerCallRef = useRef(answerCall);
    answerCallRef.current = answerCall;
    const rejectCallRef = useRef(rejectCall);
    rejectCallRef.current = rejectCall;
    const hangupRef = useRef(hangup);
    hangupRef.current = hangup;
    const flushRef = useRef(flushPendingCandidates);
    flushRef.current = flushPendingCandidates;
    const tryIceRestartRef = useRef(tryIceRestart);
    tryIceRestartRef.current = tryIceRestart;
    const getPeerInfoRef = useRef(getPeerInfo);
    getPeerInfoRef.current = getPeerInfo;

    // ═══════════════════════════════════════════════════════
    //  WS подписка — ОДИН РАЗ, через refs
    // ═══════════════════════════════════════════════════════

    useEffect(() => {
        console.log('[Call] WS subscriber registered');

        const unsub = wsManager.subscribe(async (msg: WsServerMsg) => {
            switch (msg.type) {

                // ── Входящий звонок ──────────────────────
                case 'call_incoming': {
                    const { chat_id, call_id, caller_id, caller_name, sdp, encrypted } = msg.payload;
                    const st = stateRef.current.status;

                    console.log('[Call] ← call_incoming', { call_id, caller_name, currentStatus: st });

                    // Если в 'ended' — сбрасываем и принимаем
                    if (st === 'ended') {
                        cleanupRef.current();
                        setCallState(INITIAL);
                        // Даём React обновить state
                        await new Promise(r => setTimeout(r, 50));
                    } else if (st !== 'idle') {
                        console.log('[Call] Busy, auto-rejecting');
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
                        sharedMedia: [], showMediaPanel: false,
                    });

                    ringtoneRef.current.start('incoming');

                    callTimeoutRef.current = setTimeout(() => {
                        if (stateRef.current.status === 'ringing') {
                            rejectCallRef.current();
                        }
                    }, CALL_TIMEOUT_MS);
                    break;
                }

                // ── Собеседник принял ────────────────────
                case 'call_accepted': {
                    const { call_id, sdp, encrypted, chat_id } = msg.payload;

                    console.log('[Call] ← call_accepted', {
                        call_id,
                        myCallId: stateRef.current.callId,
                        match: stateRef.current.callId === call_id,
                        status: stateRef.current.status,
                    });

                    if (stateRef.current.callId !== call_id) {
                        console.warn('[Call] call_id mismatch, ignoring');
                        return;
                    }

                    clearAllTimeoutsRef.current();
                    ringtoneRef.current.stop();

                    try {
                        const pc = pcRef.current;
                        if (!pc) {
                            console.error('[Call] No PeerConnection!');
                            return;
                        }

                        const realSdp = await decryptSignaling(chat_id, sdp, encrypted);

                        console.log('[Call] Setting remote answer SDP');
                        await pc.setRemoteDescription({ type: 'answer', sdp: realSdp });

                        console.log('[Call] Flushing candidates after answer');
                        await flushRef.current();

                        setCallState(s => ({ ...s, status: 'connecting' }));

                        connectingTimeoutRef.current = setTimeout(() => {
                            if (stateRef.current.status === 'connecting') {
                                console.warn('[Call] Connecting timeout (caller)');
                                // Пробуем ICE restart перед отключением
                                if (iceRestartCountRef.current < ICE_RESTART_MAX) {
                                    tryIceRestartRef.current();
                                } else {
                                    hangupRef.current();
                                }
                            }
                        }, CONNECTING_TIMEOUT_MS);

                    } catch (e) {
                        console.error('[Call] Set answer failed:', e);
                        hangupRef.current();
                    }
                    break;
                }

                // ── ICE кандидат ─────────────────────────
                case 'call_ice': {
                    const { call_id, candidate, encrypted: enc, chat_id } = msg.payload;
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
                    console.log('[Call] ← call_rejected');
                    cleanupRef.current();
                    setCallState(s => ({ ...s, status: 'ended', endReason: 'rejected' }));
                    break;
                }

                // ── Завершён ─────────────────────────────
                case 'call_ended': {
                    const { call_id } = msg.payload;
                    const isOurCall = stateRef.current.callId === call_id;
                    const isPendingCall = pendingOfferRef.current?.callId === call_id;
                    if (!isOurCall && !isPendingCall) return;
                    console.log('[Call] ← call_ended');
                    cleanupRef.current();
                    setCallState(s => s.status === 'idle' ? s : { ...s, status: 'ended', endReason: 'hangup' });
                    break;
                }

                // ── Мьют собеседника ─────────────────────
                case 'call_mute_changed': {
                    const { call_id, muted } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    setCallState(s => ({ ...s, peerMuted: muted }));
                    break;
                }

                // ── Совместная Музыка ────────────────────
                case 'call_media_shared': {
                    const { call_id, media_id, user_id, user_name, file_id, file_name } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    // Не дублируем если уже есть
                    if (stateRef.current.sharedMedia.some(m => m.id === media_id)) return;

                    const newItem: SharedMediaItem = {
                        id: media_id, userId: user_id, userName: user_name,
                        fileId: file_id, fileName: file_name, title: '',
                        isPlaying: true, currentTime: 0, duration: 0,
                        localVolume: 70, localMuted: false,
                    };
                    setCallState(s => ({
                        ...s,
                        sharedMedia: [...s.sharedMedia, newItem],
                    }));
                    break;
                }
                case 'call_media_removed': {
                    const { call_id, media_id } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    setCallState(s => ({
                        ...s, sharedMedia: s.sharedMedia.filter(m => m.id !== media_id),
                    }));
                    break;
                }
                case 'call_media_controlled': {
                    const { call_id, media_id, action, current_time } = msg.payload;
                    if (stateRef.current.callId !== call_id) return;
                    setCallState(s => ({
                        ...s,
                        sharedMedia: s.sharedMedia.map(m => {
                            if (m.id !== media_id) return m;
                            if (action === 'play') return { ...m, isPlaying: true };
                            if (action === 'pause') return { ...m, isPlaying: false };
                            if (action === 'seek') return { ...m, currentTime: current_time };
                            return m;
                        }),
                    }));
                    if (action === 'seek') {
                        (window as any).__mediaSeek?.(media_id, current_time);
                    }
                    break;
                }
            }
        });

        return unsub;
    }, []);  // ← ПУСТЫЕ ЗАВИСИМОСТИ — подписка ОДНА на всё время

    // ── Cleanup при размонтировании ──────────────────────

    useEffect(() => {
        return () => cleanupRef.current();
    }, []);

    return {
        callState,
        startCall, answerCall, rejectCall, hangup,
        toggleMute, setPeerVolume, setMicGain, dismissCall,
        toggleMediaPanel, shareMedia, removeMedia, controlMedia,
        setMediaVolume, toggleMediaMute, updateMediaTitle, updateMediaTime,
    };
}