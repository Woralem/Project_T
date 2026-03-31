import { create } from 'zustand';
import type { CallState, SharedMediaItem, WsServerMsg, LocalChat } from '../types';
import { wsManager } from '../websocket';
import { cryptoManager } from '../crypto';
import { getFileUrl, uploadFile } from '../api';

const ICE_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

const INITIAL: CallState = {
    status: 'idle', chatId: null, callId: null, peerId: null, peerName: null,
    isMuted: false, peerMuted: false, duration: 0, isEncrypted: false,
    peerVolume: 100, micGain: 100, sharedMedia: [], showMediaPanel: false,
};

async function encSig(chatId: string, data: string) {
    if (!cryptoManager.hasChatKey(chatId)) return { data, encrypted: false };
    try { const p = await cryptoManager.encrypt(chatId, data); return { data: JSON.stringify(p), encrypted: true }; }
    catch { return { data, encrypted: false }; }
}

async function decSig(chatId: string, data: string, enc: boolean) {
    if (!enc) return data;
    try { const p = JSON.parse(data); return await cryptoManager.decrypt(chatId, p.ciphertext, p.nonce); }
    catch { return data; }
}

interface Internal {
    _pc: RTCPeerConnection | null;
    _localStream: MediaStream | null;
    _remoteAudio: HTMLAudioElement | null;
    _timer: ReturnType<typeof setInterval> | null;
    _pendingOffer: { chatId: string; callId: string; sdp: string; encrypted: boolean; callerId: string; callerName: string } | null;
    _pendingCandidates: RTCIceCandidateInit[];
    _audioCtx: AudioContext | null;
    _gainNode: GainNode | null;
    _connectedFired: boolean;
    _mediaAudios: Map<string, HTMLAudioElement>;
    _mediaTimers: Map<string, ReturnType<typeof setInterval>>;
}

interface Actions {
    startCall: (chatId: string, chats: LocalChat[], currentUserId: string) => Promise<void>;
    answerCall: () => Promise<void>;
    rejectCall: () => void;
    hangup: () => void;
    toggleMute: () => void;
    setPeerVolume: (v: number) => void;
    setMicGain: (v: number) => void;
    dismissCall: () => void;
    toggleMediaPanel: () => void;
    shareMedia: (fileId: string, fileName: string) => void;
    removeMedia: (mediaId: string) => void;
    controlMedia: (mediaId: string, action: 'play' | 'pause' | 'seek' | 'loop', time?: number) => void;
    setMediaVolume: (mediaId: string, volume: number) => void;
    toggleMediaMute: (mediaId: string) => void;
    updateMediaTime: (mediaId: string, currentTime: number, duration: number) => void;
    updateMediaTitle: (mediaId: string, title: string) => void;
    handleWsCallEvent: (msg: WsServerMsg, chats: LocalChat[], currentUserId: string) => Promise<void>;
    _cleanup: () => void;
    _getProcessedStream: (raw: MediaStream) => MediaStream;
    _markConnected: (chatId: string) => void;
    _flushCandidates: () => Promise<void>;
}

type Store = CallState & Internal & Actions;

export const useCallStore = create<Store>((set, get) => ({
    ...INITIAL,
    _pc: null, _localStream: null, _remoteAudio: null, _timer: null,
    _pendingOffer: null, _pendingCandidates: [],
    _audioCtx: null, _gainNode: null, _connectedFired: false,
    _mediaAudios: new Map(), _mediaTimers: new Map(),

    _cleanup: () => {
        const s = get();
        s._pc?.close();
        s._localStream?.getTracks().forEach(t => t.stop());
        if (s._timer) clearInterval(s._timer);
        if (s._remoteAudio) s._remoteAudio.srcObject = null;
        if (s._audioCtx?.state !== 'closed') s._audioCtx?.close().catch(() => { });
        s._mediaAudios.forEach(a => { a.pause(); a.src = ''; });
        s._mediaTimers.forEach(t => clearInterval(t));
        set({
            _pc: null, _localStream: null, _timer: null,
            _audioCtx: null, _gainNode: null, _connectedFired: false,
            _pendingOffer: null, _pendingCandidates: [],
            _mediaAudios: new Map(), _mediaTimers: new Map(),
        });
    },

    _getProcessedStream: (raw) => {
        try {
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(raw);
            const gain = ctx.createGain();
            gain.gain.value = (get().micGain / 100) * 2;
            const dest = ctx.createMediaStreamDestination();
            source.connect(gain).connect(dest);
            set({ _audioCtx: ctx, _gainNode: gain });
            return dest.stream;
        } catch { return raw; }
    },

    // ★ Единая точка перехода в connected
    _markConnected: (chatId) => {
        if (get()._connectedFired) return;
        set({ _connectedFired: true, status: 'connected', isEncrypted: cryptoManager.hasChatKey(chatId) });
        console.log('[Call] ✓ CONNECTED');
        if (!get()._timer) {
            const timer = setInterval(() => set(s => ({ duration: s.duration + 1 })), 1000);
            set({ _timer: timer });
        }
    },

    _flushCandidates: async () => {
        const { _pc, _pendingCandidates } = get();
        if (!_pc?.remoteDescription || !_pendingCandidates.length) return;
        const candidates = [..._pendingCandidates];
        set({ _pendingCandidates: [] });
        for (const c of candidates) {
            try { await _pc.addIceCandidate(c); } catch { /* */ }
        }
    },

    startCall: async (chatId, chats, currentUserId) => {
        const s = get();
        if (s.status !== 'idle' && s.status !== 'ended') return;
        if (s.status === 'ended') get()._cleanup();

        const chat = chats.find(c => c.id === chatId);
        const other = chat?.members.find(m => m.user_id !== currentUserId);
        const callId = crypto.randomUUID();

        try {
            const raw = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            const processed = get()._getProcessedStream(raw);
            const pc = new RTCPeerConnection(ICE_CONFIG);
            const audio = new Audio(); audio.autoplay = true;

            processed.getTracks().forEach(t => pc.addTrack(t, processed));

            pc.onicecandidate = async (e) => {
                if (!e.candidate) return;
                const enc = await encSig(chatId, JSON.stringify(e.candidate.toJSON()));
                wsManager.send({ type: 'call_ice', payload: { chat_id: chatId, call_id: callId, candidate: enc.data, encrypted: enc.encrypted } });
            };

            pc.ontrack = (e) => {
                if (e.streams[0]) { audio.srcObject = e.streams[0]; audio.volume = get().peerVolume / 100; }
            };

            // ★ Оба listener для надёжности
            pc.onconnectionstatechange = () => {
                const st = pc.connectionState;
                console.log('[Call] connectionState:', st);
                if (st === 'connected') get()._markConnected(chatId);
                if (st === 'failed') get().hangup();
            };

            pc.oniceconnectionstatechange = () => {
                const st = pc.iceConnectionState;
                console.log('[Call] iceConnectionState:', st);
                if (st === 'connected' || st === 'completed') get()._markConnected(chatId);
                if (st === 'failed') get().hangup();
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const enc = await encSig(chatId, offer.sdp!);
            wsManager.send({ type: 'call_offer', payload: { chat_id: chatId, call_id: callId, sdp: enc.data, encrypted: enc.encrypted } });

            set({
                status: 'calling', chatId, callId, peerId: other?.user_id || null,
                peerName: other?.display_name || 'Неизвестный', peerAvatarUrl: other?.avatar_url,
                isMuted: false, peerMuted: false, duration: 0,
                sharedMedia: [], showMediaPanel: false, _connectedFired: false,
                _pc: pc, _localStream: raw, _remoteAudio: audio,
            });

            setTimeout(() => {
                const cur = get();
                if (cur.status === 'calling' && cur.callId === callId) {
                    wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
                    get()._cleanup();
                    set({ ...INITIAL, status: 'ended', endReason: 'timeout', peerName: other?.display_name || null, peerAvatarUrl: other?.avatar_url });
                }
            }, 35000);
        } catch (e) {
            console.error('[Call] Start failed:', e);
            set({ ...INITIAL, status: 'ended', endReason: 'error', peerName: other?.display_name || null });
        }
    },

    answerCall: async () => {
        const offer = get()._pendingOffer;
        if (!offer || get().status !== 'ringing') return;

        try {
            const raw = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            });
            const processed = get()._getProcessedStream(raw);
            const pc = new RTCPeerConnection(ICE_CONFIG);
            const audio = new Audio(); audio.autoplay = true;

            processed.getTracks().forEach(t => pc.addTrack(t, processed));

            pc.onicecandidate = async (e) => {
                if (!e.candidate) return;
                const enc = await encSig(offer.chatId, JSON.stringify(e.candidate.toJSON()));
                wsManager.send({ type: 'call_ice', payload: { chat_id: offer.chatId, call_id: offer.callId, candidate: enc.data, encrypted: enc.encrypted } });
            };

            pc.ontrack = (e) => {
                if (e.streams[0]) { audio.srcObject = e.streams[0]; audio.volume = get().peerVolume / 100; }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') get()._markConnected(offer.chatId);
                if (pc.connectionState === 'failed') get().hangup();
            };

            pc.oniceconnectionstatechange = () => {
                const st = pc.iceConnectionState;
                if (st === 'connected' || st === 'completed') get()._markConnected(offer.chatId);
                if (st === 'failed') get().hangup();
            };

            const sdp = await decSig(offer.chatId, offer.sdp, offer.encrypted);
            await pc.setRemoteDescription({ type: 'offer', sdp });

            set({ _pc: pc, _localStream: raw, _remoteAudio: audio, _connectedFired: false });
            await get()._flushCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const enc = await encSig(offer.chatId, answer.sdp!);
            wsManager.send({ type: 'call_answer', payload: { chat_id: offer.chatId, call_id: offer.callId, sdp: enc.data, encrypted: enc.encrypted } });

            set({ status: 'connecting', _pendingCandidates: [] });
        } catch (e) {
            console.error('[Call] Answer failed:', e);
            get()._cleanup();
            set({ ...INITIAL, status: 'ended', endReason: 'error' });
        }
    },

    rejectCall: () => {
        const offer = get()._pendingOffer;
        if (offer) wsManager.send({ type: 'call_reject', payload: { chat_id: offer.chatId, call_id: offer.callId } });
        set({ ...INITIAL, _pendingOffer: null, _pendingCandidates: [] });
    },

    hangup: () => {
        const { chatId, callId, peerName, peerAvatarUrl } = get();
        if (chatId && callId) wsManager.send({ type: 'call_hangup', payload: { chat_id: chatId, call_id: callId } });
        get()._cleanup();
        set({ ...INITIAL, status: 'ended', endReason: 'hangup', peerName, peerAvatarUrl });
    },

    toggleMute: () => {
        const { _localStream, isMuted, chatId, callId } = get();
        const track = _localStream?.getAudioTracks()[0];
        if (!track) return;
        track.enabled = isMuted;
        set({ isMuted: !isMuted });
        if (chatId && callId) wsManager.send({ type: 'call_mute', payload: { chat_id: chatId, call_id: callId, muted: !isMuted } });
    },

    setPeerVolume: (v) => {
        const vol = Math.max(0, Math.min(100, v));
        if (get()._remoteAudio) get()._remoteAudio!.volume = vol / 100;
        set({ peerVolume: vol });
    },

    setMicGain: (v) => {
        const vol = Math.max(0, Math.min(100, v));
        if (get()._gainNode) get()._gainNode!.gain.value = (vol / 100) * 2;
        set({ micGain: vol });
    },

    dismissCall: () => { get()._cleanup(); set(INITIAL); },
    toggleMediaPanel: () => set(s => ({ showMediaPanel: !s.showMediaPanel })),

    shareMedia: (fileId, fileName) => {
        const { chatId, callId } = get();
        if (chatId && callId) wsManager.send({ type: 'call_media_share', payload: { chat_id: chatId, call_id: callId, file_id: fileId, file_name: fileName } });
    },

    removeMedia: (mediaId) => {
        const { chatId, callId, _mediaAudios, _mediaTimers } = get();
        const a = _mediaAudios.get(mediaId); if (a) { a.pause(); a.src = ''; _mediaAudios.delete(mediaId); }
        const t = _mediaTimers.get(mediaId); if (t) { clearInterval(t); _mediaTimers.delete(mediaId); }
        set(s => ({ sharedMedia: s.sharedMedia.filter(m => m.id !== mediaId) }));
        if (chatId && callId) wsManager.send({ type: 'call_media_remove', payload: { chat_id: chatId, call_id: callId, media_id: mediaId } });
    },

    controlMedia: (mediaId, action, time) => {
        const audio = get()._mediaAudios.get(mediaId);
        set(s => ({
            sharedMedia: s.sharedMedia.map(m => {
                if (m.id !== mediaId) return m;
                if (action === 'play') { audio?.play().catch(() => { }); return { ...m, isPlaying: true }; }
                if (action === 'pause') { audio?.pause(); return { ...m, isPlaying: false }; }
                if (action === 'loop') { if (audio) audio.loop = !m.isLooping; return { ...m, isLooping: !m.isLooping }; }
                if (action === 'seek' && time !== undefined) { if (audio) audio.currentTime = time; return { ...m, currentTime: time }; }
                return m;
            }),
        }));
    },

    setMediaVolume: (mediaId, volume) => {
        const a = get()._mediaAudios.get(mediaId); if (a) a.volume = volume / 100;
        set(s => ({ sharedMedia: s.sharedMedia.map(m => m.id !== mediaId ? m : { ...m, localVolume: volume, localMuted: false }) }));
    },

    toggleMediaMute: (mediaId) => {
        set(s => ({
            sharedMedia: s.sharedMedia.map(m => {
                if (m.id !== mediaId) return m;
                const muted = !m.localMuted;
                const a = get()._mediaAudios.get(mediaId); if (a) a.volume = muted ? 0 : m.localVolume / 100;
                return { ...m, localMuted: muted };
            }),
        }));
    },

    updateMediaTime: (mid, ct, dur) => set(s => ({ sharedMedia: s.sharedMedia.map(m => m.id !== mid ? m : { ...m, currentTime: ct, duration: dur || m.duration }) })),
    updateMediaTitle: (mid, title) => set(s => ({ sharedMedia: s.sharedMedia.map(m => m.id !== mid ? m : { ...m, title }) })),

    handleWsCallEvent: async (msg, chats, currentUserId) => {
        const s = get();
        switch (msg.type) {
            case 'call_incoming': {
                const { chat_id, call_id, caller_id, caller_name, sdp, encrypted } = msg.payload;
                if (s.status !== 'idle' && s.status !== 'ended') { wsManager.send({ type: 'call_reject', payload: { chat_id, call_id } }); return; }
                if (s.status === 'ended') get()._cleanup();
                const chat = chats.find(c => c.id === chat_id);
                const caller = chat?.members.find(m => m.user_id === caller_id);
                set({ ...INITIAL, status: 'ringing', chatId: chat_id, callId: call_id, peerId: caller_id, peerName: caller_name, peerAvatarUrl: caller?.avatar_url, isEncrypted: encrypted, _pendingOffer: { chatId: chat_id, callId: call_id, sdp, encrypted, callerId: caller_id, callerName: caller_name }, _pendingCandidates: [] });
                break;
            }
            case 'call_accepted': {
                const { call_id, sdp, encrypted, chat_id } = msg.payload;
                if (s.callId !== call_id || !s._pc) return;
                try {
                    const realSdp = await decSig(chat_id, sdp, encrypted);
                    await s._pc.setRemoteDescription({ type: 'answer', sdp: realSdp });
                    set({ status: 'connecting' });
                    await get()._flushCandidates();
                } catch { get().hangup(); }
                break;
            }
            case 'call_ice': {
                const { call_id, candidate, encrypted: enc, chat_id } = msg.payload;
                if (s.callId !== call_id && s._pendingOffer?.callId !== call_id) return;
                try {
                    const cid = s.chatId || s._pendingOffer?.chatId || chat_id;
                    const raw = await decSig(cid, candidate, enc);
                    const parsed = JSON.parse(raw);
                    if (s._pc?.remoteDescription) await s._pc.addIceCandidate(parsed);
                    else set(st => ({ _pendingCandidates: [...st._pendingCandidates, parsed] }));
                } catch { /* */ }
                break;
            }
            case 'call_rejected':
                if (s.callId === msg.payload.call_id) { get()._cleanup(); set({ ...INITIAL, status: 'ended', endReason: 'rejected', peerName: s.peerName, peerAvatarUrl: s.peerAvatarUrl }); }
                break;
            case 'call_ended':
                if (s.callId === msg.payload.call_id || s._pendingOffer?.callId === msg.payload.call_id) { get()._cleanup(); set({ ...INITIAL, status: 'ended', endReason: 'hangup', peerName: s.peerName, peerAvatarUrl: s.peerAvatarUrl }); }
                break;
            case 'call_mute_changed':
                if (s.callId === msg.payload.call_id) set({ peerMuted: msg.payload.muted });
                break;
            case 'call_media_shared': {
                const { call_id, media_id, user_id, user_name, file_id, file_name } = msg.payload;
                if (s.callId !== call_id || s.sharedMedia.some(m => m.id === media_id)) return;
                const item: SharedMediaItem = { id: media_id, userId: user_id, userName: user_name, fileId: file_id, fileName: file_name, title: '', isPlaying: true, isLooping: false, currentTime: 0, duration: 0, localVolume: 70, localMuted: false };
                const audio = new Audio(getFileUrl(file_id)); audio.crossOrigin = 'anonymous'; audio.volume = 0.7;
                audio.onloadedmetadata = () => { get().updateMediaTime(media_id, 0, audio.duration || 0); get().updateMediaTitle(media_id, file_name.replace(/\.[^.]+$/, '')); };
                audio.onended = () => { get().controlMedia(media_id, 'pause'); get().updateMediaTime(media_id, 0, audio.duration || 0); };
                audio.play().catch(() => { });
                const timer = setInterval(() => { const a = get()._mediaAudios.get(media_id); if (a) get().updateMediaTime(media_id, a.currentTime, a.duration || 0); }, 500);
                get()._mediaAudios.set(media_id, audio); get()._mediaTimers.set(media_id, timer);
                set(s => ({ sharedMedia: [...s.sharedMedia, item] }));
                break;
            }
            case 'call_media_removed': {
                const { call_id, media_id } = msg.payload;
                if (s.callId !== call_id) return;
                const a = get()._mediaAudios.get(media_id); if (a) { a.pause(); a.src = ''; get()._mediaAudios.delete(media_id); }
                const t = get()._mediaTimers.get(media_id); if (t) { clearInterval(t); get()._mediaTimers.delete(media_id); }
                set(s => ({ sharedMedia: s.sharedMedia.filter(m => m.id !== media_id) }));
                break;
            }
        }
    },
}));