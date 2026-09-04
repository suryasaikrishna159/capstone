import React, { useEffect, useRef, useState } from 'react';
import '../styles/components.css';

function VideoTile({ stream, userName, isMuted, isCameraOff, isScreenSharing, isLocal, isHost, iceState }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const tryPlay = async () => {
      try {
        await video.play();
        setAutoplayBlocked(false);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
          console.warn(`[VideoTile] Autoplay blocked for ${userName} — waiting for click`);
          setAutoplayBlocked(true);
        }
      }
    };

    const t = setTimeout(tryPlay, 100);
    return () => clearTimeout(t);
  }, [stream]);

  // Separate audio element for remote (bypasses autoplay on some browsers)
  useEffect(() => {
    if (isLocal || !stream || !audioRef.current) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const audioStream = new MediaStream(audioTracks);
    audioRef.current.srcObject = audioStream;
    audioRef.current.play().catch(() => {});
  }, [stream, isLocal]);

  const handleTileClick = () => {
    videoRef.current?.play().then(() => setAutoplayBlocked(false)).catch(() => {});
    if (audioRef.current) audioRef.current.play().catch(() => {});
  };

  const hasVideo = stream && stream.getVideoTracks().length > 0;
  const showPlaceholder = isCameraOff || !stream || !hasVideo;

  // ICE state helpers
  const isConnecting = !isLocal && iceState && iceState !== 'connected' && iceState !== 'completed';
  const isFailed     = !isLocal && (iceState === 'failed');

  return (
    <div
      className={`video-tile ${isLocal ? 'local' : ''} ${isScreenSharing ? 'screen-sharing' : ''}`}
      onClick={autoplayBlocked ? handleTileClick : undefined}
      style={{ cursor: autoplayBlocked ? 'pointer' : 'default' }}
    >
      {/* Main video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`video-element ${showPlaceholder ? 'hidden' : ''}`}
      />

      {/* Separate audio for remote participants */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />}

      {/* Avatar when camera is off or no stream */}
      {showPlaceholder && (
        <div className="video-placeholder">
          <div className="placeholder-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p className="placeholder-name">{userName || 'Unknown'}</p>
        </div>
      )}

      {/* ICE connecting indicator */}
      {isConnecting && !isFailed && !autoplayBlocked && (
        <div className="ice-overlay ice-connecting">
          <div className="ice-spinner" />
          <span>Connecting...</span>
        </div>
      )}

      {/* ICE failed indicator — ICE auto-restart is running in background */}
      {isFailed && (
        <div className="ice-overlay ice-failed">
          <span className="ice-failed-icon">⚠️</span>
          <span>Reconnecting...</span>
          <small>Trying TURN relay</small>
        </div>
      )}

      {/* Autoplay blocked overlay */}
      {autoplayBlocked && !isLocal && (
        <div className="autoplay-overlay">
          <div className="autoplay-btn">
            <span>▶</span>
            <span>Click to play</span>
          </div>
        </div>
      )}

      {/* Name + status overlay */}
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoTile;