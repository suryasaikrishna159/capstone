import React, { useEffect, useRef } from 'react';
import '../styles/components.css';

function VideoTile({ stream, userName, isMuted, isCameraOff, isScreenSharing, isLocal, isHost }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-tile ${isLocal ? 'local' : ''} ${isScreenSharing ? 'screen-sharing' : ''}`}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`video-element ${isCameraOff && !isScreenSharing ? 'hidden' : ''}`}
        />
      ) : null}

      {(isCameraOff && !isScreenSharing) || !stream ? (
        <div className="video-placeholder">
          <div className="placeholder-avatar">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p className="placeholder-name">{userName || 'Unknown'}</p>
        </div>
      ) : null}

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
