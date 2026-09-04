import React, { useEffect, useRef, useState } from 'react';
import '../styles/components.css';

function VideoTile({ stream, userName, isMuted, isCameraOff, isScreenSharing, isLocal, isHost }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // Attach stream to video element and explicitly trigger play()
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    // Explicitly call play() — required in many browsers even with autoPlay attribute
    const tryPlay = async () => {
      try {
        await video.play();
        setAutoplayBlocked(false);
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
          console.warn('[VideoTile] Autoplay blocked for', userName, '— waiting for click');
          setAutoplayBlocked(true);
        }
      }
    };

    // Small delay to ensure the stream is stable before playing
    const timer = setTimeout(tryPlay, 100);
    return () => clearTimeout(timer);
  }, [stream]);

  // Separate audio element for remote participants
  // This bypasses autoplay restrictions on video elements in some browsers
  useEffect(() => {
    if (isLocal || !stream || !audioRef.current) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream(audioTracks);
    audioRef.current.srcObject = audioStream;
    audioRef.current.play().catch(() => {});
  }, [stream, isLocal]);

  const handleTileClick = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play()
      .then(() => setAutoplayBlocked(false))
      .catch(() => {});

    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  };

  const hasVideo = stream && stream.getVideoTracks().length > 0;
  const showPlaceholder = isCameraOff || !stream || !hasVideo;

  return (
    <div
      className={`video-tile ${isLocal ? 'local' : ''} ${isScreenSharing ? 'screen-sharing' : ''}`}
      onClick={autoplayBlocked ? handleTileClick : undefined}
      style={{ cursor: autoplayBlocked ? 'pointer' : 'default' }}
    >
      {/* Video element — always rendered, hidden when camera off */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`video-element ${showPlaceholder ? 'hidden' : ''}`}
      />

      {/* Separate audio element for remote participants (not shown, just plays audio) */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />}

      {/* Avatar placeholder when camera is off or no stream */}
      {showPlaceholder && (
        <div className="video-placeholder">
          <div className="placeholder-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p className="placeholder-name">{userName || 'Unknown'}</p>
        </div>
      )}

      {/* Autoplay blocked overlay — user must click to start audio/video */}
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
            <span className={`status-icon ${isMuted ? 'muted' : 'active'}`} title={isMuted ? 'Muted' : 'Unmuted'}>
              {isMuted ? '🔇' : '🎙️'}
            </span>
            <span className={`status-icon ${isCameraOff ? 'off' : 'active'}`} title={isCameraOff ? 'Camera off' : 'Camera on'}>
              {isCameraOff ? '📵' : '📹'}
            </span>
            {isScreenSharing && <span className="status-icon active" title="Sharing screen">🖥️</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoTile;