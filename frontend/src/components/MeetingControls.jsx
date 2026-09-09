import React, { useState } from 'react';
import '../styles/components.css';

function MeetingControls({
  isMuted, isCameraOff, isScreenSharing,
  onToggleMute, onToggleCamera, onScreenShare, onStopScreenShare,
  onToggleChat, onToggleParticipants,
  onToggleTranslation, onToggleTranscript,
  onLeaveMeeting, onEndMeeting,
  isHost, chatOpen, participantsOpen, translationOpen, transcriptOpen,
  translationEnabled,
  meetingId
}) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const handleLeave = () => {
    if (isHost) {
      setShowLeaveConfirm(true);
    } else {
      onLeaveMeeting();
    }
  };

  const copyMeetingId = () => {
    navigator.clipboard.writeText(meetingId);
  };

  return (
    <>
      <div className="meeting-controls">
        <div className="controls-left">
          <div className="meeting-id-pill" onClick={copyMeetingId} title="Click to copy">
            <span>📋</span>
            <span className="id-text">{meetingId}</span>
          </div>
        </div>

        <div className="controls-center">
          <button
            className={`control-btn ${isMuted ? 'control-btn-danger' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            <span className="control-icon">{isMuted ? '🔇' : '🎙️'}</span>
            <span className="control-label">{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            className={`control-btn ${isCameraOff ? 'control-btn-danger' : ''}`}
            onClick={onToggleCamera}
            title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            aria-label={isCameraOff ? 'Camera On' : 'Camera Off'}
          >
            <span className="control-icon">{isCameraOff ? '📵' : '📹'}</span>
            <span className="control-label">{isCameraOff ? 'Start Video' : 'Stop Video'}</span>
          </button>

          <button
            className={`control-btn ${isScreenSharing ? 'control-btn-active' : ''}`}
            onClick={isScreenSharing ? onStopScreenShare : onScreenShare}
            title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
            aria-label={isScreenSharing ? 'Stop Share' : 'Share Screen'}
          >
            <span className="control-icon">🖥️</span>
            <span className="control-label">{isScreenSharing ? 'Stop Share' : 'Share'}</span>
          </button>

          {/* V3: Translation button */}
          <button
            className={`control-btn ${(translationOpen || translationEnabled) ? 'control-btn-active' : ''}`}
            onClick={onToggleTranslation}
            title="Language & Translation settings"
            aria-label="Translation"
          >
            <span className="control-icon">🌐</span>
            <span className="control-label">{translationEnabled ? 'Translate' : 'Translate'}</span>
          </button>

          {/* V3: Transcript button — only show when translation is enabled */}
          {translationEnabled && (
            <button
              className={`control-btn ${transcriptOpen ? 'control-btn-active' : ''}`}
              onClick={onToggleTranscript}
              title="Live transcript"
              aria-label="Transcript"
            >
              <span className="control-icon">📝</span>
              <span className="control-label">Transcript</span>
            </button>
          )}

          <button
            className={`control-btn ${chatOpen ? 'control-btn-active' : ''}`}
            onClick={onToggleChat}
            title="Toggle chat"
            aria-label="Chat"
          >
            <span className="control-icon">💬</span>
            <span className="control-label">Chat</span>
          </button>

          <button
            className={`control-btn ${participantsOpen ? 'control-btn-active' : ''}`}
            onClick={onToggleParticipants}
            title="Toggle participants"
            aria-label="Participants"
          >
            <span className="control-icon">👥</span>
            <span className="control-label">People</span>
          </button>
        </div>

        <div className="controls-right">
          <button
            className="control-btn control-btn-leave"
            onClick={handleLeave}
            title="Leave meeting"
            aria-label="Leave meeting"
          >
            <span className="control-icon">📴</span>
            <span className="control-label">Leave</span>
          </button>
        </div>
      </div>

      {showLeaveConfirm && (
        <div className="modal-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3>Leave or End Meeting?</h3>
            <p>As the host, you can leave while keeping the meeting open, or end it for everyone.</p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setShowLeaveConfirm(false); onLeaveMeeting(); }}>
                Leave Meeting
              </button>
              <button className="btn btn-danger" onClick={() => { setShowLeaveConfirm(false); onEndMeeting(); }}>
                End for Everyone
              </button>
              <button className="btn btn-ghost" onClick={() => setShowLeaveConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MeetingControls;