import React from 'react';
import '../styles/components.css';

function ParticipantList({ participants, localUser, hostId, onRemoveParticipant, isHost, onClose }) {
  const allParticipants = [
    { socketId: 'local', userId: localUser?.userId, userName: localUser?.name || 'You', isMuted: localUser?.isMuted, isCameraOff: localUser?.isCameraOff, isLocal: true },
    ...participants.filter(p => p.userId !== localUser?.userId)
  ];

  return (
    <div className="panel participants-panel">
      <div className="panel-header">
        <h3>👥 Participants ({allParticipants.length})</h3>
        <button className="panel-close" onClick={onClose} aria-label="Close participants">✕</button>
      </div>

      <div className="participants-list">
        {allParticipants.map((p) => (
          <div key={p.socketId} className="participant-item">
            <div className="participant-avatar">
              {(p.userName || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="participant-info">
              <span className="participant-name">
                {p.userName || 'Unknown'}
                {p.isLocal && ' (You)'}
              </span>
              {p.userId === hostId && (
                <span className="host-label">⭐ Host</span>
              )}
            </div>
            <div className="participant-status">
              <span title={p.isMuted ? 'Muted' : 'Speaking'} className={p.isMuted ? 'status-muted' : 'status-speaking'}>
                {p.isMuted ? '🔇' : '🎙️'}
              </span>
              <span title={p.isCameraOff ? 'Camera off' : 'Camera on'}>
                {p.isCameraOff ? '📵' : '📹'}
              </span>
            </div>
            {isHost && !p.isLocal && (
              <button
                className="btn-remove"
                onClick={() => onRemoveParticipant(p.socketId)}
                title={`Remove ${p.userName}`}
                aria-label={`Remove ${p.userName}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ParticipantList;
