import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { toast } from 'react-toastify';

import { meetingApi, messageApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useTranslatedAudio } from '../hooks/useTranslatedAudio';
import { useSpeakingDetection } from '../hooks/useSpeakingDetection';
import { getSpeechCode } from '../config/languages';

import VideoGrid from '../components/VideoGrid';
import MeetingControls from '../components/MeetingControls';
import ChatPanel from '../components/ChatPanel';
import ParticipantList from '../components/ParticipantList';
import TranslationPanel from '../components/TranslationPanel';
import TranscriptPanel from '../components/TranscriptPanel';
import { TranslationStatus } from '../components/TranslationStatus';
import Loading from '../components/Loading';

import '../styles/meeting.css';
import '../styles/translation.css';

function Meeting() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { getToken, userId } = useAuth();
  const { user } = useUser();

  // ── Existing V2 state ──────────────────────────────────────────────────────
  const [meetingData, setMeetingData]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [loadingMsg, setLoadingMsg]       = useState('Loading meeting...');
  const [chatOpen, setChatOpen]           = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [messages, setMessages]           = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [connStatus, setConnStatus]       = useState('connecting');

  // ── V3 translation state ───────────────────────────────────────────────────
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [spokenLang, setSpokenLang]       = useState('en');
  const [listeningLang, setListeningLang] = useState('te');
  const [translationOpen, setTranslationOpen]   = useState(false);
  const [transcriptOpen, setTranscriptOpen]     = useState(false);
  const [ttsEnabled, setTtsEnabled]             = useState(true);
  const [originalAudioEnabled, setOriginalAudioEnabled] = useState(true);
  const [transcripts, setTranscripts]           = useState([]);
  const [partialTranscripts, setPartialTranscripts] = useState({}); // { speakerId: { speakerName, sourceText } }
  const [speakingUsers, setSpeakingUsers]       = useState({}); // { socketId: bool }

  const utteranceSeqRef = useRef(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const socketRef     = useRef(null);
  const joinedRef     = useRef(false);
  const meetingDataRef = useRef(null);
  const initDoneRef   = useRef(false);

  const userName =
    user?.firstName ||
    user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
    'Guest';

  // Stable socket proxy so hooks can always call socket.emit
  const socketProxy = useRef({
    emit: (...args) => {
      if (socketRef.current) socketRef.current.emit(...args);
      else console.warn('[Meeting] socket.emit before ready:', args[0]);
    }
  });

  // ── WebRTC hook ────────────────────────────────────────────────────────────
  const {
    localStream, remoteStreams,
    isMuted, isCameraOff, isScreenSharing, mediaError,
    initLocalStream, createOffer, handleOffer, handleAnswer,
    handleIceCandidate, handleUserLeft, updateRemoteUser,
    toggleMute, toggleCamera, startScreenShare, stopScreenShare, cleanup
  } = useWebRTC({ socket: socketProxy.current, meetingId });

  // Stable refs for socket callbacks
  const createOfferRef        = useRef(createOffer);
  const handleOfferRef        = useRef(handleOffer);
  const handleAnswerRef       = useRef(handleAnswer);
  const handleIceCandidateRef = useRef(handleIceCandidate);
  const handleUserLeftRef     = useRef(handleUserLeft);
  const updateRemoteUserRef   = useRef(updateRemoteUser);

  useEffect(() => { createOfferRef.current        = createOffer;        }, [createOffer]);
  useEffect(() => { handleOfferRef.current         = handleOffer;         }, [handleOffer]);
  useEffect(() => { handleAnswerRef.current        = handleAnswer;        }, [handleAnswer]);
  useEffect(() => { handleIceCandidateRef.current  = handleIceCandidate;  }, [handleIceCandidate]);
  useEffect(() => { handleUserLeftRef.current      = handleUserLeft;      }, [handleUserLeft]);
  useEffect(() => { updateRemoteUserRef.current    = updateRemoteUser;    }, [updateRemoteUser]);

  // ── V3: TTS audio queue ────────────────────────────────────────────────────
  const { enqueue: ttsEnqueue, clear: ttsClear, isSpeaking: ttsSpeaking } =
    useTranslatedAudio({ enabled: ttsEnabled && translationEnabled });

  // ── V3: Speech recognition (STT) ──────────────────────────────────────────
  const onSTTPartial = useCallback((text) => {
    if (!text.trim()) return;
    // Show locally and broadcast for remote transcript panel
    setPartialTranscripts(prev => ({
      ...prev,
      [userId]: { speakerName: userName, sourceText: text }
    }));
    socketRef.current?.emit('transcript-partial', {
      meetingId, utteranceId: `${userId}-partial`,
      speakerId: userId, speakerName: userName,
      sourceText: text, sourceLang: spokenLang, timestamp: Date.now()
    });
  }, [meetingId, userId, userName, spokenLang]);

  const onSTTFinal = useCallback((text) => {
    if (!text.trim()) return;
    const utteranceId = `${userId}-${++utteranceSeqRef.current}`;
    const timestamp   = Date.now();

    // Clear our own partial
    setPartialTranscripts(prev => { const n = { ...prev }; delete n[userId]; return n; });

    // Add to local transcript immediately (before server echoes back)
    setTranscripts(prev => [...prev, {
      utteranceId, speakerId: userId, speakerName: userName,
      sourceText: text, sourceLang: spokenLang, status: 'final', timestamp
    }]);

    // Send to server for translation
    socketRef.current?.emit('transcript-final', {
      meetingId, utteranceId,
      speakerId: userId, speakerName: userName,
      sourceText: text, sourceLang: spokenLang, timestamp
    });
  }, [meetingId, userId, userName, spokenLang]);

  const { isListening, isSupported: sttSupported, error: sttError } = useSpeechRecognition({
    enabled: translationEnabled && !isMuted,
    speechCode: getSpeechCode(spokenLang),
    isMuted,
    isTTSPlaying: ttsSpeaking,
    onPartial: onSTTPartial,
    onFinal: onSTTFinal,
  });

  // ── V3: Speaking detection (local) ─────────────────────────────────────────
  const { isSpeaking: localSpeaking } = useSpeakingDetection({
    stream: localStream,
    enabled: translationEnabled
  });

  // Broadcast speaking state
  useEffect(() => {
    if (!translationEnabled) return;
    socketRef.current?.emit('speaker-speaking', { meetingId, isSpeaking: localSpeaking });
  }, [localSpeaking, translationEnabled, meetingId]);

  // Emit language preference when changed or when translation enabled
  useEffect(() => {
    if (!translationEnabled || !socketRef.current?.connected) return;
    socketRef.current.emit('language-updated', { meetingId, spokenLang, listeningLang });
  }, [spokenLang, listeningLang, translationEnabled, meetingId]);

  // ── Main initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !meetingId) return;
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    const init = async () => {
      try {
        setLoadingMsg('Verifying meeting...');
        const token = await getToken();
        const mkToken = () => Promise.resolve(token);

        const { meeting } = await meetingApi.get(mkToken, meetingId);
        if (!meeting) throw new Error('Meeting not found');
        if (meeting.status === 'ended') throw new Error('This meeting has ended');
        meetingDataRef.current = meeting;
        setMeetingData(meeting);

        setLoadingMsg('Joining meeting...');
        await meetingApi.join(mkToken, meetingId, { userName });

        try {
          const { messages: prev } = await messageApi.getMessages(mkToken, meetingId);
          setMessages(prev || []);
        } catch (_) {}

        setLoadingMsg('Setting up camera & microphone...');
        await initLocalStream();

        setLoadingMsg('Connecting to meeting room...');
        const s = connectSocket();
        socketRef.current = s;

        await new Promise((resolve, reject) => {
          if (s.connected) { resolve(); return; }
          const onConnect    = () => { s.off('connect_error', onError); resolve(); };
          const onError      = (err) => { s.off('connect', onConnect); reject(err); };
          s.once('connect', onConnect);
          s.once('connect_error', onError);
          setTimeout(() => { s.off('connect', onConnect); s.off('connect_error', onError); resolve(); }, 5000);
        });

        setConnStatus('connected');
        setupSocketListeners(s);

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
      ttsClear();
      cleanup();
      disconnectSocket();
    };
  }, [userId, meetingId]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  const setupSocketListeners = (s) => {
    [
      'existing-users','user-joined','offer','answer','ice-candidate',
      'user-left','mute-status','camera-status','screen-share-started',
      'screen-share-stopped','chat-message','participant-update',
      'removed-from-meeting','meeting-ended','error',
      // V3 events
      'transcript-partial','transcript-final','translation-complete',
      'translation-error','speaker-update'
    ].forEach(e => s.off(e));

    // ── V2 events ──────────────────────────────────────────────────────────
    s.on('existing-users', (users) => {
      console.log('[Meeting] Existing users:', users.map(u => u.userName));
      users.forEach(u => createOfferRef.current(u.socketId, u));
    });

    s.on('user-joined', (info) => {
      toast.info(`${info.userName} joined`, { autoClose: 2000 });
      // If translation is active, re-emit language preference so new joiner's server state knows ours
      if (translationEnabled) {
        s.emit('language-updated', { meetingId, spokenLang, listeningLang });
      }
    });

    s.on('offer',          (data) => handleOfferRef.current(data));
    s.on('answer',         (data) => handleAnswerRef.current(data));
    s.on('ice-candidate',  (data) => handleIceCandidateRef.current(data));

    s.on('user-left', (data) => {
      handleUserLeftRef.current(data.socketId);
      toast.info(`${data.userName || 'Participant'} left`, { autoClose: 2000 });
      // Clean up V3 state
      setSpeakingUsers(prev => { const n = { ...prev }; delete n[data.socketId]; return n; });
      setPartialTranscripts(prev => { const n = { ...prev }; delete n[data.userId]; return n; });
    });

    s.on('mute-status',          ({ socketId, isMuted })     => updateRemoteUserRef.current(socketId, { isMuted }));
    s.on('camera-status',        ({ socketId, isCameraOff }) => updateRemoteUserRef.current(socketId, { isCameraOff }));
    s.on('screen-share-started', ({ socketId })              => updateRemoteUserRef.current(socketId, { isScreenSharing: true }));
    s.on('screen-share-stopped', ({ socketId })              => updateRemoteUserRef.current(socketId, { isScreenSharing: false }));

    s.on('chat-message', (msg) => setMessages(prev => [...prev, msg]));
    s.on('participant-update', ({ participants }) => setParticipants(participants));

    s.on('removed-from-meeting', ({ message }) => { toast.error(message || 'You were removed'); doLeave(true); });
    s.on('meeting-ended',        ({ message }) => { toast.info(message || 'Meeting ended');    doLeave(true); });
    s.on('error', ({ message }) => toast.error(message));

    s.on('disconnect', (reason) => { console.warn('[Meeting] Disconnected:', reason); setConnStatus('disconnected'); });
    s.on('reconnect', () => {
      setConnStatus('connected');
      s.emit('join-room', { meetingId, userId, userName });
      if (translationEnabled) s.emit('language-updated', { meetingId, spokenLang, listeningLang });
    });

    // ── V3 events ──────────────────────────────────────────────────────────
    // Remote participant's partial transcript (for live display only)
    s.on('transcript-partial', (data) => {
      if (data.speakerId === userId) return; // ignore our own (we handle locally)
      setPartialTranscripts(prev => ({
        ...prev,
        [data.speakerId]: { speakerName: data.speakerName, sourceText: data.sourceText }
      }));
    });

    // Remote participant's final transcript
    s.on('transcript-final', (data) => {
      if (data.speakerId === userId) return; // we already added ours locally
      setPartialTranscripts(prev => { const n = { ...prev }; delete n[data.speakerId]; return n; });
      setTranscripts(prev => {
        // Avoid duplicates
        if (prev.some(t => t.utteranceId === data.utteranceId)) return prev;
        return [...prev, { ...data, status: 'final' }];
      });
    });

    // Translated text + TTS for this client
    s.on('translation-complete', (data) => {
      // Update existing transcript entry with translation
      setTranscripts(prev => prev.map(t =>
        t.utteranceId === data.utteranceId
          ? { ...t, translatedText: data.translatedText, targetLang: data.targetLang, latency: data.latency, status: 'translated' }
          : t
      ));

      // Play TTS if enabled
      if (ttsEnabled && translationEnabled && data.translatedText && !data.error) {
        const lang = getSpeechCode(data.targetLang);
        ttsEnqueue(data.translatedText, lang);
      }
    });

    s.on('translation-error', ({ utteranceId, error: errMsg }) => {
      console.warn('[Meeting] Translation error for', utteranceId, errMsg);
      setTranscripts(prev => prev.map(t =>
        t.utteranceId === utteranceId ? { ...t, status: 'error' } : t
      ));
    });

    // Remote speaker activity
    s.on('speaker-update', ({ socketId, isSpeaking }) => {
      setSpeakingUsers(prev => ({ ...prev, [socketId]: isSpeaking }));
    });
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
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

  // ── Leave ──────────────────────────────────────────────────────────────────
  const doLeave = useCallback(async (forced = false) => {
    if (!joinedRef.current && !forced) return;
    joinedRef.current = false;
    ttsClear();
    try {
      socketRef.current?.emit('leave-room', { meetingId });
      const token = await getToken();
      await meetingApi.leave(() => Promise.resolve(token), meetingId);
    } catch (_) {}
    cleanup();
    disconnectSocket();
    navigate('/dashboard');
  }, [meetingId, getToken, cleanup, navigate, ttsClear]);

  const handleEndMeeting = useCallback(async () => {
    try {
      const token = await getToken();
      await meetingApi.end(() => Promise.resolve(token), meetingId);
      socketRef.current?.emit('end-meeting', { meetingId, hostUserId: userId });
    } catch (err) {
      toast.error(err.message || 'Failed to end meeting');
      return;
    }
    ttsClear();
    cleanup();
    disconnectSocket();
    navigate('/dashboard');
  }, [meetingId, userId, getToken, cleanup, navigate, ttsClear]);

  const handleRemoveParticipant = useCallback((targetSocketId) => {
    socketRef.current?.emit('remove-participant', { meetingId, targetSocketId, hostUserId: userId });
  }, [meetingId, userId]);

  // ── V3: Panel toggles (mutually exclusive with chat/participants) ──────────
  const toggleTranslation = () => {
    setTranslationOpen(p => !p);
    setChatOpen(false);
    setParticipantsOpen(false);
    setTranscriptOpen(false);
  };

  const toggleTranscript = () => {
    setTranscriptOpen(p => !p);
    setChatOpen(false);
    setParticipantsOpen(false);
    setTranslationOpen(false);
  };

  // ── V3: Translation toggle ─────────────────────────────────────────────────
  const handleTranslationToggle = () => {
    const next = !translationEnabled;
    setTranslationEnabled(next);
    if (next) {
      socketRef.current?.emit('language-updated', { meetingId, spokenLang, listeningLang });
    } else {
      ttsClear();
      setPartialTranscripts({});
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <Loading message={loadingMsg} />;

  const isHost    = meetingData?.hostId === userId;
  const localUser = { userId, name: userName, isMuted, isCameraOff };
  const anyPanelOpen = chatOpen || participantsOpen || translationOpen || transcriptOpen;

  return (
    <div className="meeting-room">
      {/* Header */}
      <div className="meeting-header">
        <div className="meeting-header-left">
          <span className="brand-icon-sm">📡</span>
          <span className="meeting-name">{meetingData?.title || 'Meeting'}</span>
          {isHost && <span className="host-you-badge">⭐ Host</span>}
          {/* V3: Translation badge */}
          {translationEnabled && (
            <span className="translation-badge">
              🌐 {spokenLang.toUpperCase()} → {listeningLang.toUpperCase()}
            </span>
          )}
        </div>
        <div className="meeting-header-right">
          <div className={`connection-status ${connStatus}`}>
            <span className="status-dot" />
            {connStatus === 'connected' ? 'Connected' : connStatus === 'disconnected' ? 'Reconnecting...' : 'Connecting...'}
          </div>
        </div>
      </div>

      {/* V3: Translation status bar */}
      {translationEnabled && (
        <TranslationStatus
          isListening={isListening}
          isSpeaking={ttsSpeaking}
          spokenLang={spokenLang}
          listeningLang={listeningLang}
          sttSupported={sttSupported}
        />
      )}

      {mediaError && (
        <div className="media-error-banner">⚠️ {mediaError}</div>
      )}

      {sttError && translationEnabled && (
        <div className="media-error-banner">🎙️ {sttError}</div>
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
            localSpeaking={localSpeaking}
            speakingUsers={speakingUsers}
            originalAudioEnabled={originalAudioEnabled}
          />
        </div>

        <div className={`meeting-panels ${anyPanelOpen ? 'panels-open' : ''}`}>
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
          {/* V3 panels */}
          {translationOpen && (
            <TranslationPanel
              isOpen={translationOpen}
              onClose={() => setTranslationOpen(false)}
              spokenLang={spokenLang}
              listeningLang={listeningLang}
              translationEnabled={translationEnabled}
              ttsEnabled={ttsEnabled}
              originalAudioEnabled={originalAudioEnabled}
              transcriptVisible={transcriptOpen}
              onSpokenLangChange={setSpokenLang}
              onListeningLangChange={setListeningLang}
              onTranslationToggle={handleTranslationToggle}
              onTtsToggle={() => setTtsEnabled(p => !p)}
              onOriginalAudioToggle={() => setOriginalAudioEnabled(p => !p)}
              onTranscriptToggle={() => { setTranscriptOpen(p => !p); setTranslationOpen(false); }}
            />
          )}
          {transcriptOpen && (
            <TranscriptPanel
              transcripts={transcripts}
              partials={partialTranscripts}
              onClose={() => setTranscriptOpen(false)}
              currentUserId={userId}
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
        onToggleChat={() => { setChatOpen(p => !p); setParticipantsOpen(false); setTranslationOpen(false); setTranscriptOpen(false); }}
        onToggleParticipants={() => { setParticipantsOpen(p => !p); setChatOpen(false); setTranslationOpen(false); setTranscriptOpen(false); }}
        onToggleTranslation={toggleTranslation}
        onToggleTranscript={toggleTranscript}
        onLeaveMeeting={() => doLeave(false)}
        onEndMeeting={handleEndMeeting}
        isHost={isHost}
        chatOpen={chatOpen}
        participantsOpen={participantsOpen}
        translationOpen={translationOpen}
        transcriptOpen={transcriptOpen}
        translationEnabled={translationEnabled}
        meetingId={meetingId}
      />
    </div>
  );
}

export default Meeting;