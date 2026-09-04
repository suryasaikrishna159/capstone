import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { toast } from 'react-toastify';

import { meetingApi, messageApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useWebRTC } from '../hooks/useWebRTC';

import VideoGrid from '../components/VideoGrid';
import MeetingControls from '../components/MeetingControls';
import ChatPanel from '../components/ChatPanel';
import ParticipantList from '../components/ParticipantList';
import Loading from '../components/Loading';

import '../styles/meeting.css';

function Meeting() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { getToken, userId } = useAuth();
  const { user } = useUser();

  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Loading meeting...');
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [connStatus, setConnStatus] = useState('connecting');

  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const meetingDataRef = useRef(null);
  const initDoneRef = useRef(false); // prevent double-init

  const userName =
    user?.firstName ||
    user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    'Guest';

  // Stable socket proxy — useWebRTC can always call socket.emit
  // even before the actual socket is assigned to socketRef
  const socketProxy = useRef({
    emit: (...args) => {
      if (socketRef.current) {
        socketRef.current.emit(...args);
      } else {
        console.warn('[Meeting] socket.emit called before socket ready:', args[0]);
      }
    }
  });

  // --- WebRTC hook ---
  const {
    localStream, remoteStreams,
    isMuted, isCameraOff, isScreenSharing, mediaError,
    initLocalStream, createOffer, handleOffer, handleAnswer,
    handleIceCandidate, handleUserLeft, updateRemoteUser,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare, cleanup
  } = useWebRTC({ socket: socketProxy.current, meetingId });

  // Stable refs so socket callbacks always call the latest function versions
  const createOfferRef = useRef(createOffer);
  const handleOfferRef = useRef(handleOffer);
  const handleAnswerRef = useRef(handleAnswer);
  const handleIceCandidateRef = useRef(handleIceCandidate);
  const handleUserLeftRef = useRef(handleUserLeft);
  const updateRemoteUserRef = useRef(updateRemoteUser);

  useEffect(() => { createOfferRef.current = createOffer; }, [createOffer]);
  useEffect(() => { handleOfferRef.current = handleOffer; }, [handleOffer]);
  useEffect(() => { handleAnswerRef.current = handleAnswer; }, [handleAnswer]);
  useEffect(() => { handleIceCandidateRef.current = handleIceCandidate; }, [handleIceCandidate]);
  useEffect(() => { handleUserLeftRef.current = handleUserLeft; }, [handleUserLeft]);
  useEffect(() => { updateRemoteUserRef.current = updateRemoteUser; }, [updateRemoteUser]);

  // --- Main initialization ---
  useEffect(() => {
    if (!userId || !meetingId) return;
    if (initDoneRef.current) return; // guard against StrictMode double-call
    initDoneRef.current = true;

    const init = async () => {
      try {
        setLoadingMsg('Verifying meeting...');
        const token = await getToken();
        const mkToken = () => Promise.resolve(token);

        // 1. Fetch & validate meeting
        const { meeting } = await meetingApi.get(mkToken, meetingId);
        if (!meeting) throw new Error('Meeting not found');
        if (meeting.status === 'ended') throw new Error('This meeting has ended');
        meetingDataRef.current = meeting;
        setMeetingData(meeting);

        // 2. Register participant join in DB
        setLoadingMsg('Joining meeting...');
        await meetingApi.join(mkToken, meetingId, { userName });

        // 3. Load previous chat messages
        try {
          const { messages: prev } = await messageApi.getMessages(mkToken, meetingId);
          setMessages(prev || []);
        } catch (_) {}

        // 4. Initialize local camera + microphone
        setLoadingMsg('Setting up camera & microphone...');
        await initLocalStream();

        // 5. Connect socket and wait for it to be fully connected
        setLoadingMsg('Connecting to meeting room...');
        const s = connectSocket();
        socketRef.current = s;

        // Wait for socket to connect before joining room
        await new Promise((resolve, reject) => {
          if (s.connected) {
            resolve();
            return;
          }
          const onConnect = () => { s.off('connect_error', onError); resolve(); };
          const onError = (err) => { s.off('connect', onConnect); reject(err); };
          s.once('connect', onConnect);
          s.once('connect_error', onError);
          // Safety timeout
          setTimeout(() => { s.off('connect', onConnect); s.off('connect_error', onError); resolve(); }, 5000);
        });

        setConnStatus('connected');

        // 6. Setup all socket event listeners
        setupSocketListeners(s);

        // 7. Join the socket room
        console.log('[Meeting] Emitting join-room for', meetingId);
        s.emit('join-room', { meetingId, userId, userName });
        joinedRef.current = true;

        setLoading(false);
      } catch (err) {
        console.error('[Meeting] Init error:', err);
        toast.error(err.message || 'Failed to join meeting');
        navigate('/dashboard');
      }
    };

    init();

    return () => {
      if (joinedRef.current) {
        socketRef.current?.emit('leave-room', { meetingId });
        joinedRef.current = false;
      }
      cleanup();
      disconnectSocket();
    };
  }, [userId, meetingId]);

  // --- Socket event listeners ---
  const setupSocketListeners = (s) => {
    // Remove any lingering listeners first
    [
      'existing-users','user-joined','offer','answer','ice-candidate',
      'user-left','mute-status','camera-status','screen-share-started',
      'screen-share-stopped','chat-message','participant-update',
      'removed-from-meeting','meeting-ended','error'
    ].forEach(e => s.off(e));

    // Existing users → new joiner creates offers for each
    s.on('existing-users', (users) => {
      console.log('[Meeting] Existing users in room:', users.length, users.map(u => u.userName));
      users.forEach(u => {
        console.log('[Meeting] Creating offer for', u.userName, u.socketId);
        createOfferRef.current(u.socketId, u);
      });
    });

    s.on('user-joined', (info) => {
      console.log('[Meeting] user-joined:', info.userName);
      toast.info(`${info.userName} joined`, { autoClose: 2000 });
    });

    // WebRTC signaling relay
    s.on('offer', (data) => {
      console.log('[Meeting] Received offer from', data.from);
      handleOfferRef.current(data);
    });
    s.on('answer', (data) => {
      console.log('[Meeting] Received answer from', data.from);
      handleAnswerRef.current(data);
    });
    s.on('ice-candidate', (data) => handleIceCandidateRef.current(data));

    s.on('user-left', (data) => {
      console.log('[Meeting] user-left:', data.userName);
      handleUserLeftRef.current(data.socketId);
      toast.info(`${data.userName || 'Participant'} left`, { autoClose: 2000 });
    });

    // Media state
    s.on('mute-status', ({ socketId, isMuted }) =>
      updateRemoteUserRef.current(socketId, { isMuted }));
    s.on('camera-status', ({ socketId, isCameraOff }) =>
      updateRemoteUserRef.current(socketId, { isCameraOff }));
    s.on('screen-share-started', ({ socketId }) =>
      updateRemoteUserRef.current(socketId, { isScreenSharing: true }));
    s.on('screen-share-stopped', ({ socketId }) =>
      updateRemoteUserRef.current(socketId, { isScreenSharing: false }));

    // Chat
    s.on('chat-message', (msg) =>
      setMessages(prev => [...prev, msg]));

    // Participants list
    s.on('participant-update', ({ participants }) => {
      console.log('[Meeting] participant-update:', participants.length);
      setParticipants(participants);
    });

    // Host events
    s.on('removed-from-meeting', ({ message }) => {
      toast.error(message || 'You were removed from the meeting');
      doLeave(true);
    });
    s.on('meeting-ended', ({ message }) => {
      toast.info(message || 'Meeting ended by host');
      doLeave(true);
    });
    s.on('error', ({ message }) => toast.error(message));

    // Monitor disconnections
    s.on('disconnect', (reason) => {
      console.warn('[Meeting] Socket disconnected:', reason);
      setConnStatus('disconnected');
    });
    s.on('reconnect', () => {
      console.log('[Meeting] Socket reconnected — rejoining room');
      setConnStatus('connected');
      s.emit('join-room', { meetingId, userId, userName });
    });
  };

  // --- Send chat message ---
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', {
      meetingId, senderId: userId, senderName: userName, message: text
    });
    try {
      const token = await getToken();
      await messageApi.saveMessage(() => Promise.resolve(token), {
        meetingId, message: text, senderName: userName
      });
    } catch (_) {}
  }, [meetingId, userId, userName, getToken]);

  // --- Leave ---
  const doLeave = useCallback(async (forced = false) => {
    if (!joinedRef.current && !forced) return;
    joinedRef.current = false;
    try {
      socketRef.current?.emit('leave-room', { meetingId });
      const token = await getToken();
      await meetingApi.leave(() => Promise.resolve(token), meetingId);
    } catch (_) {}
    cleanup();
    disconnectSocket();
    navigate('/dashboard');
  }, [meetingId, getToken, cleanup, navigate]);

  // --- End meeting (host) ---
  const handleEndMeeting = useCallback(async () => {
    try {
      const token = await getToken();
      await meetingApi.end(() => Promise.resolve(token), meetingId);
      socketRef.current?.emit('end-meeting', { meetingId, hostUserId: userId });
    } catch (err) {
      toast.error(err.message || 'Failed to end meeting');
      return;
    }
    cleanup();
    disconnectSocket();
    navigate('/dashboard');
  }, [meetingId, userId, getToken, cleanup, navigate]);

  // --- Remove participant (host) ---
  const handleRemoveParticipant = useCallback((targetSocketId) => {
    socketRef.current?.emit('remove-participant', {
      meetingId, targetSocketId, hostUserId: userId
    });
  }, [meetingId, userId]);

  // --- Render ---
  if (loading) return <Loading message={loadingMsg} />;

  const isHost = meetingData?.hostId === userId;
  const localUser = { userId, name: userName, isMuted, isCameraOff };

  return (
    <div className="meeting-room">
      {/* Header */}
      <div className="meeting-header">
        <div className="meeting-header-left">
          <span className="brand-icon-sm">📡</span>
          <span className="meeting-name">{meetingData?.title || 'Meeting'}</span>
          {isHost && <span className="host-you-badge">⭐ Host</span>}
        </div>
        <div className="meeting-header-right">
          <div className={`connection-status ${connStatus}`}>
            <span className="status-dot" />
            {connStatus === 'connected' ? 'Connected' : connStatus === 'disconnected' ? 'Reconnecting...' : 'Connecting...'}
          </div>
        </div>
      </div>

      {mediaError && (
        <div className="media-error-banner">⚠️ {mediaError}</div>
      )}

      <div className="meeting-main">
        <div className="meeting-video-area">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            localUser={localUser}
            hostId={meetingData?.hostId}
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
          />
        </div>

        <div className={`meeting-panels ${(chatOpen || participantsOpen) ? 'panels-open' : ''}`}>
          {chatOpen && (
            <ChatPanel
              messages={messages}
              onSendMessage={sendMessage}
              currentUserId={userId}
              onClose={() => setChatOpen(false)}
            />
          )}
          {participantsOpen && (
            <ParticipantList
              participants={participants}
              localUser={localUser}
              hostId={meetingData?.hostId}
              isHost={isHost}
              onRemoveParticipant={handleRemoveParticipant}
              onClose={() => setParticipantsOpen(false)}
            />
          )}
        </div>
      </div>

      <MeetingControls
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
        onScreenShare={startScreenShare}
        onStopScreenShare={stopScreenShare}
        onToggleChat={() => { setChatOpen(p => !p); setParticipantsOpen(false); }}
        onToggleParticipants={() => { setParticipantsOpen(p => !p); setChatOpen(false); }}
        onLeaveMeeting={() => doLeave(false)}
        onEndMeeting={handleEndMeeting}
        isHost={isHost}
        chatOpen={chatOpen}
        participantsOpen={participantsOpen}
        meetingId={meetingId}
      />
    </div>
  );
}

export default Meeting;