/**
 * useWebRTC.js — Full-mesh WebRTC hook
 *
 * ICE/TURN servers are fetched from our own backend (/api/ice-servers) which
 * combines Metered dynamic credentials with OpenRelay free TURN. This keeps
 * the API key off the frontend bundle and allows changing TURN providers via
 * Render environment variables without a frontend redeploy.
 */
import { useRef, useState, useCallback } from 'react';

// Backend URL — resolves correctly for both local dev and production (Netlify → Render)
const BACKEND_API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Comprehensive fallback used only when the backend /api/ice-servers call fails.
// OpenRelay (no quota) is primary; Metered is secondary.
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  // OpenRelay — free, no quota
  { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  // Metered (quota-based backup)
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80',                 username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp',   username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turn:global.relay.metered.ca:443',                username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWebRTC({ socket, meetingId }) {
  const localStreamRef        = useRef(null);
  const peerConnectionsRef    = useRef({});
  const pendingCandidatesRef  = useRef({});
  const screenStreamRef       = useRef(null);
  const originalVideoTrackRef = useRef(null);
  const iceServersRef         = useRef(FALLBACK_ICE_SERVERS);
  const iceRestartCountRef    = useRef({});
  // Tracks ICE state per socketId BEFORE the remoteStreams entry is created.
  // Fixes the race where oniceconnectionstatechange fires before ontrack.
  const peerIceStatesRef      = useRef({});

  const [localStream,     setLocalStream]     = useState(null);
  const [remoteStreams,   setRemoteStreams]    = useState({});
  const [isMuted,         setIsMuted]         = useState(false);
  const [isCameraOff,     setIsCameraOff]     = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaError,      setMediaError]      = useState(null);

  // ── Fetch ICE/TURN servers from backend ────────────────────────────────────
  const fetchTurnCredentials = useCallback(async () => {
    try {
      console.log('[WebRTC] Fetching ICE servers from backend...');
      const res = await fetch(`${BACKEND_API}/ice-servers`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const servers = data.iceServers || data; // support both {iceServers:[]} and []
      if (Array.isArray(servers) && servers.length > 0) {
        iceServersRef.current = servers;
        console.log('[WebRTC] ICE servers ready —', servers.length, 'servers from backend');
      } else {
        throw new Error('Empty response');
      }
    } catch (err) {
      console.warn('[WebRTC] Backend ICE fetch failed, using built-in fallback:', err.message);
      iceServersRef.current = FALLBACK_ICE_SERVERS;
    }
  }, []);

  // ── initLocalStream ─────────────────────────────────────────────────────────
  const initLocalStream = useCallback(async () => {
    // Fetch TURN credentials in parallel with camera/mic setup
    const turnPromise = fetchTurnCredentials();

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setMediaError(null);
      console.log('[WebRTC] Local stream ready:', stream.getTracks().map(t => t.kind));
    } catch (err) {
      console.error('[WebRTC] getUserMedia error:', err.name, err.message);
      let msg = 'Could not access camera/microphone.';
      if (err.name === 'NotAllowedError')    msg = 'Permission denied — please allow camera/mic.';
      else if (err.name === 'NotFoundError') msg = 'No camera or microphone detected.';
      else if (err.name === 'NotReadableError') msg = 'Camera is already in use by another app.';
      setMediaError(msg);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setIsCameraOff(true);
        setMediaError('Camera unavailable — audio only.');
      } catch (_) {
        stream = new MediaStream();
        setMediaError('No media devices available.');
      }
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    // Wait for TURN credentials to be fetched before returning
    await turnPromise;

    return stream;
  }, [fetchTurnCredentials]);

  // ── createPeerConnection ────────────────────────────────────────────────────
  const createPeerConnection = useCallback((socketId, userInfo = {}) => {
    if (peerConnectionsRef.current[socketId]) {
      return peerConnectionsRef.current[socketId];
    }

    console.log(`[WebRTC] Creating PC for ${socketId} (${userInfo.userName}) with ${iceServersRef.current.length} ICE servers`);

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 10,
      // Removed bundlePolicy and rtcpMuxPolicy — browser defaults are more
      // compatible across networks and firewall configurations.
    });

    peerConnectionsRef.current[socketId] = pc;
    iceRestartCountRef.current[socketId] = 0;

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`[WebRTC] Adding ${track.kind} track to PC[${socketId}]`);
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Send ICE candidate to remote peer via signaling server
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.log(`[WebRTC] Local ICE candidate for ${socketId}: ${candidate.type}`);
        socket.emit('ice-candidate', { to: socketId, candidate });
      }
    };

    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] PC[${socketId}] ICE gathering: ${pc.iceGatheringState}`);
    };

    // Remote track arrived — update UI with stream.
    // Creates a NEW MediaStream on every track event so React's useEffect([stream])
    // always re-runs in VideoTile, properly re-attaching the audio element.
    //
    // RACE FIX: oniceconnectionstatechange can fire before ontrack. We store
    // the ICE state in peerIceStatesRef so ontrack can read the correct value.
    pc.ontrack = ({ streams, track }) => {
      const srcStream = (streams && streams[0]) ? streams[0] : new MediaStream([track]);
      const freshStream = new MediaStream(srcStream.getTracks());
      console.log(`[WebRTC] ✅ Got ${track.kind} track from ${socketId} (${userInfo.userName})`);

      setRemoteStreams(prev => {
        const existing = prev[socketId] || {};

        // Resolve correct ICE state: prefer already-set 'connected'/'completed',
        // then fall back to peerIceStatesRef (set by oniceconnectionstatechange),
        // then current PC state, then 'checking'.
        const goodStates = new Set(['connected', 'completed']);
        const savedState = peerIceStatesRef.current[socketId];
        const iceState   = goodStates.has(existing.iceState)  ? existing.iceState
                         : goodStates.has(savedState)          ? savedState
                         : pc.iceConnectionState               || 'checking';

        return {
          ...prev,
          [socketId]: {
            ...existing,
            stream: freshStream,
            userId:         userInfo.userId   || socketId,
            userName:       userInfo.userName || 'Participant',
            isMuted:        existing.isMuted         !== undefined ? existing.isMuted         : (userInfo.isMuted         || false),
            isCameraOff:    existing.isCameraOff     !== undefined ? existing.isCameraOff     : (userInfo.isCameraOff     || false),
            isScreenSharing:existing.isScreenSharing !== undefined ? existing.isScreenSharing : (userInfo.isScreenSharing || false),
            iceState,
          }
        };
      });
    };

    // Track ICE state changes
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] PC[${socketId}] ICE: ${state}`);

      // Always save to ref FIRST — ontrack reads this to fix the race condition
      peerIceStatesRef.current[socketId] = state;

      setRemoteStreams(prev => {
        if (!prev[socketId]) return prev; // ontrack hasn't fired yet; state saved in ref above
        return { ...prev, [socketId]: { ...prev[socketId], iceState: state } };
      });

      if (state === 'connected' || state === 'completed') {
        console.log(`[WebRTC] ✅ ICE connected to ${userInfo.userName}`);
        iceRestartCountRef.current[socketId] = 0;
        return;
      }

      // Auto-restart ICE on failure (offerer side only)
      if (state === 'failed' || state === 'disconnected') {
        const count = iceRestartCountRef.current[socketId] || 0;
        const MAX = 3;

        if (count < MAX && pc.localDescription?.type === 'offer') {
          iceRestartCountRef.current[socketId] = count + 1;
          const delay = (count + 1) * 2000;
          console.log(`[WebRTC] ICE ${state} → restarting in ${delay}ms (attempt ${count + 1}/${MAX})`);

          setTimeout(async () => {
            if (pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
            try {
              const offer = await pc.createOffer({ iceRestart: true });
              await pc.setLocalDescription(offer);
              socket.emit('offer', { to: socketId, offer });
              console.log(`[WebRTC] ICE restart offer sent to ${socketId}`);
            } catch (err) {
              console.error('[WebRTC] ICE restart failed:', err);
            }
          }, delay);
        } else if (state === 'failed' && count >= MAX) {
          console.error(`[WebRTC] ❌ All ICE restart attempts failed for ${socketId}`);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] PC[${socketId}] connection: ${pc.connectionState}`);
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
      if (pendingCandidatesRef.current[from]) {
        for (const c of pendingCandidatesRef.current[from]) {
          try { await pc.addIceCandidate(c); } catch (e) { console.warn('[WebRTC] Pending ICE add failed:', e.message); }
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
    const pc = peerConnectionsRef.current[from];
    if (!pc) return;
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        if (pendingCandidatesRef.current[from]) {
          for (const c of pendingCandidatesRef.current[from]) {
            try { await pc.addIceCandidate(c); } catch (e) { console.warn('[WebRTC] Pending ICE add failed:', e.message); }
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
    const ice = new RTCIceCandidate(candidate);
    if (pc && pc.remoteDescription?.type) {
      try {
        await pc.addIceCandidate(ice);
      } catch (err) {
        console.warn('[WebRTC] addIceCandidate failed:', err.message);
      }
    } else {
      if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
      pendingCandidatesRef.current[from].push(ice);
    }
  }, []);

  // ── handleUserLeft ──────────────────────────────────────────────────────────
  const handleUserLeft = useCallback((socketId) => {
    const pc = peerConnectionsRef.current[socketId];
    if (pc) { pc.close(); delete peerConnectionsRef.current[socketId]; }
    delete pendingCandidatesRef.current[socketId];
    delete iceRestartCountRef.current[socketId];
    delete peerIceStatesRef.current[socketId];
    setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  }, []);

  // ── updateRemoteUser ────────────────────────────────────────────────────────
  const updateRemoteUser = useCallback((socketId, updates) => {
    setRemoteStreams(prev => {
      if (!prev[socketId]) return prev;
      return { ...prev, [socketId]: { ...prev[socketId], ...updates } };
    });
  }, []);

  // ── Media controls ──────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
    socket.emit('mute-status', { meetingId, isMuted: newMuted });
  }, [isMuted, socket, meetingId]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const newOff = !isCameraOff;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    setIsCameraOff(newOff);
    socket.emit('camera-status', { meetingId, isCameraOff: newOff });
  }, [isCameraOff, socket, meetingId]);

  // ── Screen share ────────────────────────────────────────────────────────────
  const stopScreenShareRef = useRef(null);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
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

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    pendingCandidatesRef.current = {};
    iceRestartCountRef.current = {};
    peerIceStatesRef.current = {};
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
