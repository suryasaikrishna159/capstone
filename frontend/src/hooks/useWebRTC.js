/**
 * useWebRTC.js — Full-mesh WebRTC hook with TURN fallbacks and ICE auto-restart
 *
 * TURN servers tried in this order (browser picks the fastest working one):
 *   1. VITE_TURN_* env vars (Netlify → your Metered.ca account, most reliable)
 *   2. Open Relay by Metered.ca  (free, shared, openrelayproject/openrelayproject)
 *   3. FreeSun TURN             (free, shared, free/free)
 *
 * ICE restart: if ICE fails, the offerer automatically retries up to 3 times.
 */
import { useRef, useState, useCallback } from 'react';

// ─── ICE Server Config ────────────────────────────────────────────────────────
const buildIceServers = () => {
  const turnUrl  = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;

  const servers = [];

  // ① User-configured TURN (add to Netlify env vars for best reliability)
  if (turnUrl && turnUser && turnCred) {
    console.log('[WebRTC] Using custom TURN server:', turnUrl);
    servers.push(
      { urls: turnUrl,                             username: turnUser, credential: turnCred },
      { urls: `${turnUrl}?transport=tcp`,          username: turnUser, credential: turnCred }
    );
  }

  // ② STUN servers
  servers.push(
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:freestun.net:3479' }
  );

  // ③ Open Relay TURN (Metered.ca free shared server)
  servers.push(
    { urls: 'turn:openrelay.metered.live:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.live:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.live:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.live:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.live:443',              username: 'openrelayproject', credential: 'openrelayproject' }
  );

  // ④ FreeSun TURN (backup free TURN server)
  servers.push(
    { urls: 'turn:freestun.net:3479',  username: 'free', credential: 'free' },
    { urls: 'turn:freestun.net:3478',  username: 'free', credential: 'free' },
    { urls: 'turns:freestun.net:5350', username: 'free', credential: 'free' }
  );

  return servers;
};

const ICE_CONFIG = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWebRTC({ socket, meetingId }) {
  const localStreamRef        = useRef(null);
  const peerConnectionsRef    = useRef({});
  const pendingCandidatesRef  = useRef({});
  const screenStreamRef       = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const iceRestartCountRef    = useRef({}); // { socketId: number }

  const [localStream,    setLocalStream]    = useState(null);
  const [remoteStreams,  setRemoteStreams]   = useState({});
  const [isMuted,        setIsMuted]        = useState(false);
  const [isCameraOff,    setIsCameraOff]    = useState(false);
  const [isScreenSharing,setIsScreenSharing]= useState(false);
  const [mediaError,     setMediaError]     = useState(null);

  // ── initLocalStream ─────────────────────────────────────────────────────────
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      console.log('[WebRTC] Local stream ready:', stream.getTracks().map(t => t.kind));
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia error:', err.name, err.message);
      let msg = 'Could not access camera/microphone.';
      if (err.name === 'NotAllowedError')   msg = 'Permission denied. Please allow camera/mic.';
      else if (err.name === 'NotFoundError') msg = 'No camera or microphone detected.';
      else if (err.name === 'NotReadableError') msg = 'Camera is in use by another app.';
      setMediaError(msg);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioOnly;
        setLocalStream(audioOnly);
        setIsCameraOff(true);
        setMediaError('Camera unavailable — audio only.');
        return audioOnly;
      } catch (_) {
        const empty = new MediaStream();
        localStreamRef.current = empty;
        setLocalStream(empty);
        setMediaError('No media devices available.');
        return empty;
      }
    }
  }, []);

  // ── createPeerConnection ────────────────────────────────────────────────────
  const createPeerConnection = useCallback((socketId, userInfo = {}) => {
    if (peerConnectionsRef.current[socketId]) {
      return peerConnectionsRef.current[socketId];
    }

    console.log(`[WebRTC] Creating PC for ${socketId} (${userInfo.userName})`);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnectionsRef.current[socketId] = pc;
    iceRestartCountRef.current[socketId] = 0;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[WebRTC] Adding ${track.kind} track to PC[${socketId}]`);
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('[WebRTC] No local stream when creating PC — tracks not added yet');
    }

    // ICE candidate → relay to peer
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { to: socketId, candidate });
    };

    // Remote track arrived → update UI
    pc.ontrack = ({ streams }) => {
      if (streams && streams[0]) {
        console.log(`[WebRTC] Got remote track from ${socketId} (${userInfo.userName})`);
        setRemoteStreams(prev => ({
          ...prev,
          [socketId]: {
            stream: streams[0],
            userId: userInfo.userId || socketId,
            userName: userInfo.userName || 'Participant',
            isMuted: userInfo.isMuted || false,
            isCameraOff: userInfo.isCameraOff || false,
            isScreenSharing: userInfo.isScreenSharing || false,
            iceState: 'checking'
          }
        }));
      }
    };

    // ICE state changes
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] PC[${socketId}] iceConnectionState: ${state}`);

      // Keep UI in sync with ICE state
      setRemoteStreams(prev => {
        if (!prev[socketId]) return prev;
        return { ...prev, [socketId]: { ...prev[socketId], iceState: state } };
      });

      if (state === 'connected' || state === 'completed') {
        console.log(`[WebRTC] ✅ ICE connected for ${socketId}`);
        iceRestartCountRef.current[socketId] = 0; // reset retry counter
        return;
      }

      // Auto-restart ICE (only the offerer restarts — identified by localDescription.type)
      if (state === 'failed' || state === 'disconnected') {
        const maxRestarts = 3;
        const count = iceRestartCountRef.current[socketId] || 0;

        if (count < maxRestarts && pc.localDescription?.type === 'offer') {
          iceRestartCountRef.current[socketId] = count + 1;
          const delay = (count + 1) * 2000; // 2s, 4s, 6s
          console.log(`[WebRTC] ICE ${state} for ${socketId} — restarting in ${delay}ms (attempt ${count + 1}/${maxRestarts})`);

          setTimeout(async () => {
            if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              socket.emit('offer', { to: socketId, offer });
              console.log(`[WebRTC] ICE restart offer sent to ${socketId}`);
            } catch (err) {
              console.error('[WebRTC] ICE restart offer failed:', err);
            }
          }, delay);
        } else if (state === 'failed') {
          console.error(`[WebRTC] ❌ Connection permanently failed for ${socketId}.`);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] PC[${socketId}] connectionState: ${pc.connectionState}`);
    };

    return pc;
  }, [socket]);

  // ── createOffer ─────────────────────────────────────────────────────────────
  const createOffer = useCallback(async (socketId, userInfo = {}) => {
    console.log(`[WebRTC] Creating offer for ${socketId} (${userInfo.userName})`);
    const pc = createPeerConnection(socketId, userInfo);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: socketId, offer });
      console.log(`[WebRTC] Offer sent to ${socketId}`);
    } catch (err) {
      console.error('[WebRTC] createOffer error:', err);
    }
  }, [createPeerConnection, socket]);

  // ── handleOffer ─────────────────────────────────────────────────────────────
  const handleOffer = useCallback(async ({ from, offer, userInfo = {} }) => {
    console.log(`[WebRTC] Handling offer from ${from} (${userInfo.userName})`);
    const pc = createPeerConnection(from, userInfo);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      // Flush queued ICE candidates
      if (pendingCandidatesRef.current[from]) {
        for (const c of pendingCandidatesRef.current[from]) {
          try { await pc.addIceCandidate(c); } catch (_) {}
        }
        delete pendingCandidatesRef.current[from];
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
      console.log(`[WebRTC] Answer sent to ${from}`);
    } catch (err) {
      console.error('[WebRTC] handleOffer error:', err);
    }
  }, [createPeerConnection, socket]);

  // ── handleAnswer ────────────────────────────────────────────────────────────
  const handleAnswer = useCallback(async ({ from, answer }) => {
    console.log(`[WebRTC] Handling answer from ${from}`);
    const pc = peerConnectionsRef.current[from];
    if (!pc) return;
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        if (pendingCandidatesRef.current[from]) {
          for (const c of pendingCandidatesRef.current[from]) {
            try { await pc.addIceCandidate(c); } catch (_) {}
          }
          delete pendingCandidatesRef.current[from];
        }
      }
    } catch (err) {
      console.error('[WebRTC] handleAnswer error:', err);
    }
  }, []);

  // ── handleIceCandidate ──────────────────────────────────────────────────────
  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    if (!candidate) return;
    const pc = peerConnectionsRef.current[from];
    const iceCandidate = new RTCIceCandidate(candidate);
    if (pc && pc.remoteDescription?.type) {
      try { await pc.addIceCandidate(iceCandidate); } catch (_) {}
    } else {
      if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
      pendingCandidatesRef.current[from].push(iceCandidate);
    }
  }, []);

  // ── handleUserLeft ──────────────────────────────────────────────────────────
  const handleUserLeft = useCallback((socketId) => {
    const pc = peerConnectionsRef.current[socketId];
    if (pc) { pc.close(); delete peerConnectionsRef.current[socketId]; }
    delete pendingCandidatesRef.current[socketId];
    delete iceRestartCountRef.current[socketId];
    setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  }, []);

  // ── updateRemoteUser ────────────────────────────────────────────────────────
  const updateRemoteUser = useCallback((socketId, updates) => {
    setRemoteStreams(prev => {
      if (!prev[socketId]) return prev;
      return { ...prev, [socketId]: { ...prev[socketId], ...updates } };
    });
  }, []);

  // ── toggleMute ──────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
    socket.emit('mute-status', { meetingId, isMuted: newMuted });
  }, [isMuted, socket, meetingId]);

  // ── toggleCamera ────────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const newOff = !isCameraOff;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    setIsCameraOff(newOff);
    socket.emit('camera-status', { meetingId, isCameraOff: newOff });
  }, [isCameraOff, socket, meetingId]);

  // ── screen share ────────────────────────────────────────────────────────────
  const stopScreenShareRef = useRef(null);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' }, audio: false
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];
      if (localStreamRef.current) {
        originalVideoTrackRef.current = localStreamRef.current.getVideoTracks()[0] || null;
      }
      await Promise.all(Object.values(peerConnectionsRef.current).map(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        return sender ? sender.replaceTrack(screenTrack) : Promise.resolve();
      }));
      setIsScreenSharing(true);
      socket.emit('screen-share-started', { meetingId });
      screenTrack.addEventListener('ended', () => stopScreenShareRef.current?.());
    } catch (err) {
      if (err.name !== 'NotAllowedError') console.error('[WebRTC] Screen share error:', err);
    }
  }, [socket, meetingId]);

  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) return;
    screenStreamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    const orig = originalVideoTrackRef.current;
    if (orig) {
      await Promise.all(Object.values(peerConnectionsRef.current).map(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        return sender ? sender.replaceTrack(orig) : Promise.resolve();
      }));
    }
    originalVideoTrackRef.current = null;
    setIsScreenSharing(false);
    socket.emit('screen-share-stopped', { meetingId });
  }, [socket, meetingId]);

  stopScreenShareRef.current = stopScreenShare;

  // ── cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    pendingCandidatesRef.current = {};
    iceRestartCountRef.current = {};
    setLocalStream(null);
    setRemoteStreams({});
    setIsScreenSharing(false);
  }, []);

  return {
    localStream, remoteStreams,
    isMuted, isCameraOff, isScreenSharing, mediaError,
    initLocalStream, createOffer, handleOffer, handleAnswer,
    handleIceCandidate, handleUserLeft, updateRemoteUser,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare, cleanup
  };
}