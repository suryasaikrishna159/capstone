import React, { useEffect, useRef, useState } from 'react';
import '../styles/components.css';

function VideoTile({
  stream, userName, isMuted, isCameraOff, isScreenSharing,
  isLocal, isHost, iceState,
  isSpeaking,       // V3: speaking detection
  originalAudioEnabled, // V3: control original WebRTC audio
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Attach stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    const t = setTimeout(async () => {
      try {
        await video.play();
        setAutoplayBlocked(false);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
          console.warn(`[VideoTile] Autoplay blocked for ${userName}`);
          setAutoplayBlocked(true);
        }
      }
    }, 100);
    return () => clearTimeout(t);
  }, [stream]);

  // Separate audio element for remote participants
  useEffect(() => {
    if (isLocal || !stream || !audioRef.current) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;
    audioRef.current.srcObject = new MediaStream(tracks);
    audioRef.current.play().catch(() => {});
  }, [stream, isLocal]);

  // Control original audio volume based on V3 setting
  useEffect(() => {
    if (isLocal) return;
    const muted = originalAudioEnabled === false;
    if (audioRef.current) audioRef.current.muted = muted;
    if (videoRef.current) videoRef.current.muted = isLocal ? true : muted;
  }, [originalAudioEnabled, isLocal]);

  const handleTileClick = () => {
    videoRef.current?.play().then(() => setAutoplayBlocked(false)).catch(() => {});
    if (audioRef.current) audioRef.current.play().catch(() => {});
  };

  const hasVideo = stream && stream.getVideoTracks().length > 0;
  const showPlaceholder = isCameraOff || !stream || !hasVideo;
  const isConnecting = !isLocal && iceState && iceState !== 'connected' && iceState !== 'completed';
  const isFailed     = !isLocal && iceState === 'failed';

  return (
    <div
      className={`video-tile ${isLocal ? 'local' : ''} ${isScreenSharing ? 'screen-sharing' : ''} ${isSpeaking ? 'speaking' : ''}`}
      onClick={autoplayBlocked ? handleTileClick : undefined}
      style={{ cursor: autoplayBlocked ? 'pointer' : 'default' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`video-element ${showPlaceholder ? 'hidden' : ''}`}
      />

      {!isLocal && <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />}

      {showPlaceholder && (
        <div className="video-placeholder">
          <div className="placeholder-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p className="placeholder-name">{userName || 'Unknown'}</p>
        </div>
      )}

      {isConnecting && !isFailed && !autoplayBlocked && (
        <div className="ice-overlay ice-connecting">
          <div className="ice-spinner" />
          <span>Connecting...</span>
        </div>
      )}

      {isFailed && (
        <div className="ice-overlay ice-failed">
          <span className="ice-failed-icon">⚠️</span>
          <span>Reconnecting...</span>
          <small>Trying TURN relay</small>
        </div>
      )}

      {autoplayBlocked && !isLocal && (
        <div className="autoplay-overlay">
          <div className="autoplay-btn">
            <span>▶</span>
            <span>Click to play</span>
          </div>
        </div>
      )}

      <div className="tile-overlay">
        <div className="tile-info">
          <span className="tile-name">
            {userName || 'Unknown'}
            {isLocal && ' (You)'}
            {isHost && <span className="host-badge"> ⭐ Host</span>}
          </span>
          <div className="tile-status">
            <span className={`status-icon ${isMuted ? 'muted' : 'active'}`}>
              {isMuted ? '🔇' : '🎙️'}
            </span>
            <span className={`status-icon ${isCameraOff ? 'off' : 'active'}`}>
              {isCameraOff ? '📵' : '📹'}
            </span>
            {isScreenSharing && <span className="status-icon active">🖥️</span>}
            {isSpeaking && <span className="status-icon active speaking-pulse">●</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoTile;