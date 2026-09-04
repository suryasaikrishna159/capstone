/**
 * useWebRTC.js
 * Manages all WebRTC peer connections (full-mesh architecture).
 *
 * TURN servers are REQUIRED for reliable production use when participants
 * are on different networks/ISPs (especially behind carrier-grade NAT).
 *
 * Set these in Netlify environment variables:
 *   VITE_TURN_URL      = turn:YOUR_TURN_SERVER:3478
 *   VITE_TURN_USERNAME = your_username
 *   VITE_TURN_CREDENTIAL = your_credential
 */
import { useRef, useState, useCallback } from 'react';

// ─── ICE Server Config ───────────────────────────────────────────────────────
const buildIceServers = () => {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  // Custom TURN server from environment (set in Netlify env vars)
  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUser = import.meta.env.VITE_TURN_USERNAME;
  const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    console.log('[WebRTC] Using configured TURN server:', turnUrl);
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  } else {
    // Free Open Relay TURN server — works globally, no sign-up needed.
    // Limits: ~500MB/month free bandwidth. Replace with your own for production.
    console.log('[WebRTC] Using Open Relay TURN server (free tier)');
    servers.push(
      { urls: 'turn:openrelay.metered.live:80',  username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.live:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turns:openrelay.metered.live:443', username: 'openrelayproject', credential: 'openrelayproject' }
    );
  }

  return servers;
};

const ICE_CONFIG = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all' // Try direct first, then relay
};

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useWebRTC({ socket, meetingId }) {
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const screenStreamRef = useRef(null);
  const originalVideoTrackRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaError, setMediaError] = useState(null);

  // ── initLocalStream ───────────────────────────────────────────────────────
  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      console.log('[WebRTC] Local stream ready. Tracks:', stream.getTracks().map(t => t.kind));
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia error:', err.name, err.message);
      let msg = 'Failed to access camera/microphone.';
      if (err.name === 'NotAllowedError') msg = 'Permission denied. Please allow camera/mic access.';
      else if (err.name === 'NotFoundError') msg = 'No camera or microphone found.';
      else if (err.name === 'NotReadableError') msg = 'Camera/mic in use by another app.';
      setMediaError(msg);

      // Fallback: audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsCameraOff(true);
        setMediaError('Camera unavailable — joining with audio only.');
        return audioStream;
      } catch (_) {
        const emptyStream = new MediaStream();
        localStreamRef.current = emptyStream;
        setLocalStream(emptyStream);
        setMediaError('No media devices available.');
        return emptyStream;
      }
    }
  }, []);

  // ── createPeerConnection ──────────────────────────────────────────────────
  const createPeerConnection = useCallback((socketId, userInfo = {}) => {
    if (peerConnectionsRef.current[socketId]) {
      return peerConnectionsRef.current[socketId];
    }

    console.log(`[WebRTC] Creating PC for ${socketId} (${userInfo.userName})`);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnectionsRef.current[socketId] = pc;

    // Add local tracks to PC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[WebRTC] Adding ${track.kind} track to PC[${socketId}]`);
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      console.warn('[WebRTC] No local stream when creating PC — tracks not added');
    }

    // Send ICE candidates to remote peer via signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('ice-candidate', { to: socketId, candidate });
      }
    };

    pc.onicecandidateerror = (e) => {
      // Only log serious errors, not routine STUN/TURN misses
      if (e.errorCode !== 701) {
        console.warn(`[WebRTC] ICE candidate error [${socketId}]:`, e.errorText);
      }
    };

    // Receive remote media tracks
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
            isScreenSharing: userInfo.isScreenSharing || false
          }
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] PC[${socketId}] connectionState: ${state}`);
      if (state === 'failed') {
        console.error(`[WebRTC] Connection FAILED for ${socketId}. ICE may need TURN.`);
        setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] PC[${socketId}] iceConnectionState: ${pc.iceConnectionState}`);
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] PC[${socketId}] signalingState: ${pc.signalingState}`);
    };

    return pc;
  }, [socket]);

  // ── createOffer ───────────────────────────────────────────────────────────
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

  // ── handleOffer ───────────────────────────────────────────────────────────
  const handleOffer = useCallback(async ({ from, offer, userInfo = {} }) => {
    console.log(`[WebRTC] Handling offer from ${from} (${userInfo.userName})`);
    const pc = createPeerConnection(from, userInfo);
    try {
      if (pc.signalingState !== 'have-remote-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      }
      // Flush any queued ICE candidates
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

  // ── handleAnswer ──────────────────────────────────────────────────────────
  const handleAnswer = useCallback(async ({ from, answer }) => {
    console.log(`[WebRTC] Handling answer from ${from}`);
    const pc = peerConnectionsRef.current[from];
    if (!pc) { console.warn('[WebRTC] No PC found for answer from', from); return; }
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        // Flush queued ICE candidates
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

  // ── handleIceCandidate ────────────────────────────────────────────────────
  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    if (!candidate) return;
    const pc = peerConnectionsRef.current[from];
    const iceCandidate = new RTCIceCandidate(candidate);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try { await pc.addIceCandidate(iceCandidate); } catch (_) {}
    } else {
      // Queue candidates that arrive before remote description is set
      if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
      pendingCandidatesRef.current[from].push(iceCandidate);
    }
  }, []);

  // ── handleUserLeft ────────────────────────────────────────────────────────
  const handleUserLeft = useCallback((socketId) => {
    console.log('[WebRTC] User left, closing PC:', socketId);
    const pc = peerConnectionsRef.current[socketId];
    if (pc) { pc.close(); delete peerConnectionsRef.current[socketId]; }
    delete pendingCandidatesRef.current[socketId];
    setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  }, []);

  // ── updateRemoteUser ──────────────────────────────────────────────────────
  const updateRemoteUser = useCallback((socketId, updates) => {
    setRemoteStreams(prev => {
      if (!prev[socketId]) return prev;
      return { ...prev, [socketId]: { ...prev[socketId], ...updates } };
    });
  }, []);

  // ── toggleMute ────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
    socket.emit('mute-status', { meetingId, isMuted: newMuted });
  }, [isMuted, socket, meetingId]);

  // ── toggleCamera ──────────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const newOff = !isCameraOff;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    setIsCameraOff(newOff);
    socket.emit('camera-status', { meetingId, isCameraOff: newOff });
  }, [isCameraOff, socket, meetingId]);

  // ── stopScreenShare ref (prevents stale closure) ──────────────────────────
  const stopScreenShareRef = useRef(null);

  // ── startScreenShare ──────────────────────────────────────────────────────
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

  // ── stopScreenShare ───────────────────────────────────────────────────────
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

  // ── cleanup ───────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    pendingCandidatesRef.current = {};
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