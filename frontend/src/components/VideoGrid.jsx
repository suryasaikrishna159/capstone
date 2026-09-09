import React from 'react';
import VideoTile from './VideoTile';
import '../styles/components.css';

function VideoGrid({
  localStream, remoteStreams, localUser, hostId,
  isMuted, isCameraOff, isScreenSharing,
  localSpeaking,      // V3
  speakingUsers,      // V3: { socketId: bool }
  originalAudioEnabled, // V3
}) {
  const remoteEntries = Object.entries(remoteStreams);
  const totalParticipants = 1 + remoteEntries.length;

  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-1';
    if (totalParticipants === 2) return 'grid-2';
    if (totalParticipants <= 4) return 'grid-4';
    if (totalParticipants <= 6) return 'grid-6';
    return 'grid-many';
  };

  return (
    <div className={`video-grid ${getGridClass()}`}>
      <VideoTile
        stream={localStream}
        userName={localUser?.name || 'You'}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        isLocal={true}
        isHost={localUser?.userId === hostId}
        iceState="connected"
        isSpeaking={localSpeaking || false}
        originalAudioEnabled={true}
      />
      {remoteEntries.map(([socketId, info]) => (
        <VideoTile
          key={socketId}
          stream={info.stream}
          userName={info.userName}
          isMuted={info.isMuted}
          isCameraOff={info.isCameraOff}
          isScreenSharing={info.isScreenSharing}
          isLocal={false}
          isHost={info.userId === hostId}
          iceState={info.iceState || 'checking'}
          isSpeaking={speakingUsers?.[socketId] || false}
          originalAudioEnabled={originalAudioEnabled}
        />
      ))}
    </div>
  );
}

export default VideoGrid;