/**
 * useWebRTC.js
 * Manages all WebRTC peer connections for MeetSpace (full-mesh architecture).
 *
 * Future multilingual extension point:
 * localStream and remoteStreams are exposed so a future audio processing
 * pipeline (speech recognition -> translation -> TTS) can intercept tracks.
 */
import { useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Add TURN servers here for production NAT traversal:
    // { urls: 'turn:your-turn-server.com', username: '...', credential: '...' }
  ],
  iceCandidatePoolSize: 10
};

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
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const initLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia error:', err.name, err.message);
      let errorMsg = 'Failed to access camera/microphone.';
      if (err.name === 'NotAllowedError') errorMsg = 'Camera/microphone permission denied. Please allow access and reload.';
      else if (err.name === 'NotFoundError') errorMsg = 'No camera or microphone found on this device.';
      else if (err.name === 'NotReadableError') errorMsg = 'Camera or microphone is already in use by another app.';
      setMediaError(errorMsg);

      // Fallback: audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsCameraOff(true);
        setMediaError('Camera unavailable. Joining with audio only.');
        return audioStream;
      } catch (_) {
        const emptyStream = new MediaStream();
        localStreamRef.current = emptyStream;
        setLocalStream(emptyStream);
        setMediaError('No media devices available. Others may not see or hear you.');
        return emptyStream;
      }
    }
  }, []);

  const createPeerConnection = useCallback((socketId, userInfo = {}) => {
    if (peerConnectionsRef.current[socketId]) {
      return peerConnectionsRef.current[socketId];
    }
    console.log(`[WebRTC] Creating PC for ${socketId} (${userInfo.userName})`);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current[socketId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', { to: socketId, candidate });
    };

    pc.ontrack = ({ streams }) => {
      if (streams && streams[0]) {
        console.log(`[WebRTC] Got remote track from ${socketId}`);
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
      if (state === 'connected') setConnectionStatus('connected');
      else if (state === 'failed') {
        setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
      }
    };

    pc.oniceconnectionstatechange = () =>
      console.log(`[WebRTC] PC[${socketId}] iceConnectionState: ${pc.iceConnectionState}`);

    return pc;
  }, [socket]);

  const createOffer = useCallback(async (socketId, userInfo = {}) => {
    const pc = createPeerConnection(socketId, userInfo);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('offer', { to: socketId, offer });
      console.log(`[WebRTC] Sent offer to ${socketId}`);
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }, [createPeerConnection, socket]);

  const handleOffer = useCallback(async ({ from, offer, userInfo = {} }) => {
    console.log(`[WebRTC] Received offer from ${from}`);
    const pc = createPeerConnection(from, userInfo);
    try {
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      }

      if (pendingCandidatesRef.current[from]) {
        for (const c of pendingCandidatesRef.current[from]) {
          try { await pc.addIceCandidate(c); } catch (_) {}
        }
        delete pendingCandidatesRef.current[from];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
      console.log(`[WebRTC] Sent answer to ${from}`);
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
    }
  }, [createPeerConnection, socket]);

  const handleAnswer = useCallback(async ({ from, answer }) => {
    console.log(`[WebRTC] Received answer from ${from}`);
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
      console.error('[WebRTC] Error handling answer:', err);
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    if (!candidate) return;
    const pc = peerConnectionsRef.current[from];
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    } else {
      if (!pendingCandidatesRef.current[from]) pendingCandidatesRef.current[from] = [];
      pendingCandidatesRef.current[from].push(new RTCIceCandidate(candidate));
    }
  }, []);

  const handleUserLeft = useCallback((socketId) => {
    console.log('[WebRTC] User left:', socketId);
    const pc = peerConnectionsRef.current[socketId];
    if (pc) { pc.close(); delete peerConnectionsRef.current[socketId]; }
    delete pendingCandidatesRef.current[socketId];
    setRemoteStreams(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  }, []);

  const updateRemoteUser = useCallback((socketId, updates) => {
    setRemoteStreams(prev => {
      if (!prev[socketId]) return prev;
      return { ...prev, [socketId]: { ...prev[socketId], ...updates } };
    });
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
    socket.emit('mute-status', { meetingId, isMuted: newMuted });
  }, [isMuted, socket, meetingId]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const newCameraOff = !isCameraOff;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !newCameraOff; });
    setIsCameraOff(newCameraOff);
    socket.emit('camera-status', { meetingId, isCameraOff: newCameraOff });
  }, [isCameraOff, socket, meetingId]);

  // Ref to stopScreenShare so the 'ended' event handler never has a stale closure
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
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        return sender ? sender.replaceTrack(screenTrack) : Promise.resolve();
      }));
      setIsScreenSharing(true);
      socket.emit('screen-share-started', { meetingId });
      // Use ref to avoid stale closure when browser's stop button is clicked
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
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        return sender ? sender.replaceTrack(orig) : Promise.resolve();
      }));
    }
    originalVideoTrackRef.current = null;
    setIsScreenSharing(false);
    socket.emit('screen-share-stopped', { meetingId });
  }, [socket, meetingId]);

  // Keep ref always pointing to latest stopScreenShare
  stopScreenShareRef.current = stopScreenShare;



  const cleanup = useCallback(() => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    pendingCandidatesRef.current = {};
    setLocalStream(null);
    setRemoteStreams({});
    setIsScreenSharing(false);
    setConnectionStatus('connecting');
  }, []);

  return {
    localStream, remoteStreams,
    isMuted, isCameraOff, isScreenSharing, mediaError, connectionStatus,
    initLocalStream, createOffer, handleOffer, handleAnswer, handleIceCandidate,
    handleUserLeft, updateRemoteUser,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare, cleanup
  };
}
