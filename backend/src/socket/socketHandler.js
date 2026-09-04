/**
 * Socket.IO signaling server for MeetSpace WebRTC.
 *
 * Handles:
 * - Room management (join-room, leave-room)
 * - WebRTC signaling (offer, answer, ice-candidate)
 * - Media state (mute-status, camera-status)
 * - Screen sharing events
 * - Real-time chat
 * - Host controls (remove-participant, end-meeting)
 */

// roomUsers: Map<meetingId, Map<socketId, userInfo>>
const roomUsers = new Map();

// socketToRoom: Map<socketId, meetingId> (for disconnect handling)
const socketToRoom = new Map();

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // ─── Join Room ───────────────────────────────────────────────────────────
    socket.on('join-room', ({ meetingId, userId, userName }) => {
      if (!meetingId || !userId) {
        socket.emit('error', { message: 'meetingId and userId are required' });
        return;
      }

      socket.join(meetingId);
      socketToRoom.set(socket.id, meetingId);

      if (!roomUsers.has(meetingId)) {
        roomUsers.set(meetingId, new Map());
      }

      const room = roomUsers.get(meetingId);

      // Send list of existing users to the new joiner
      const existingUsers = Array.from(room.entries()).map(([sid, info]) => ({
        socketId: sid,
        ...info
      }));
      socket.emit('existing-users', existingUsers);

      // Add new user to room tracking
      const userInfo = {
        userId,
        userName: userName || 'Guest',
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false
      };
      room.set(socket.id, userInfo);

      // Notify existing users about new joiner
      socket.to(meetingId).emit('user-joined', {
        socketId: socket.id,
        ...userInfo
      });

      // Send current participant list to everyone in the room
      broadcastParticipants(io, meetingId);

      console.log(`User ${userName}(${socket.id}) joined room ${meetingId}. Room size: ${room.size}`);
    });

    // ─── WebRTC Signaling ─────────────────────────────────────────────────────
    socket.on('offer', ({ to, offer }) => {
      const meetingId = socketToRoom.get(socket.id);
      const room = meetingId ? roomUsers.get(meetingId) : null;
      const senderInfo = room ? room.get(socket.id) : {};

      io.to(to).emit('offer', {
        from: socket.id,
        offer,
        userInfo: senderInfo || {}
      });
    });

    socket.on('answer', ({ to, answer }) => {
      io.to(to).emit('answer', {
        from: socket.id,
        answer
      });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate
      });
    });

    // ─── Media State ──────────────────────────────────────────────────────────
    socket.on('mute-status', ({ meetingId, isMuted }) => {
      const room = roomUsers.get(meetingId);
      if (room && room.has(socket.id)) {
        room.get(socket.id).isMuted = isMuted;
      }
      socket.to(meetingId).emit('mute-status', { socketId: socket.id, isMuted });
      broadcastParticipants(io, meetingId);
    });

    socket.on('camera-status', ({ meetingId, isCameraOff }) => {
      const room = roomUsers.get(meetingId);
      if (room && room.has(socket.id)) {
        room.get(socket.id).isCameraOff = isCameraOff;
      }
      socket.to(meetingId).emit('camera-status', { socketId: socket.id, isCameraOff });
      broadcastParticipants(io, meetingId);
    });

    socket.on('screen-share-started', ({ meetingId }) => {
      const room = roomUsers.get(meetingId);
      if (room && room.has(socket.id)) {
        room.get(socket.id).isScreenSharing = true;
      }
      socket.to(meetingId).emit('screen-share-started', { socketId: socket.id });
    });

    socket.on('screen-share-stopped', ({ meetingId }) => {
      const room = roomUsers.get(meetingId);
      if (room && room.has(socket.id)) {
        room.get(socket.id).isScreenSharing = false;
      }
      socket.to(meetingId).emit('screen-share-stopped', { socketId: socket.id });
    });

    // ─── Chat ──────────────────────────────────────────────────────────────────
    socket.on('chat-message', ({ meetingId, senderId, senderName, message }) => {
      if (!message || !message.trim()) return;

      const payload = {
        socketId: socket.id,
        senderId,
        senderName,
        message: message.trim(),
        timestamp: new Date().toISOString()
      };

      // Broadcast to everyone in room including sender
      io.to(meetingId).emit('chat-message', payload);
    });

    // ─── Host Controls ────────────────────────────────────────────────────────
    socket.on('remove-participant', ({ meetingId, targetSocketId, hostUserId }) => {
      const room = roomUsers.get(meetingId);
      if (!room) return;

      // Verify the requester is actually the host (validate by userId in room)
      const requesterInfo = room.get(socket.id);
      if (!requesterInfo || requesterInfo.userId !== hostUserId) {
        socket.emit('error', { message: 'Only the host can remove participants' });
        return;
      }

      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('removed-from-meeting', {
          message: 'You have been removed from the meeting by the host.'
        });
        handleUserLeave(io, targetSocket, meetingId);
      }
    });

    socket.on('end-meeting', ({ meetingId, hostUserId }) => {
      const room = roomUsers.get(meetingId);
      if (!room) return;

      const requesterInfo = room.get(socket.id);
      if (!requesterInfo || requesterInfo.userId !== hostUserId) {
        socket.emit('error', { message: 'Only the host can end the meeting' });
        return;
      }

      // Notify all participants
      io.to(meetingId).emit('meeting-ended', {
        message: 'The host has ended the meeting.'
      });

      // Clear room
      roomUsers.delete(meetingId);
    });

    // ─── Leave Room ──────────────────────────────────────────────────────────
    socket.on('leave-room', ({ meetingId }) => {
      handleUserLeave(io, socket, meetingId);
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      const meetingId = socketToRoom.get(socket.id);
      if (meetingId) {
        handleUserLeave(io, socket, meetingId);
      }
      socketToRoom.delete(socket.id);
    });
  });
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function handleUserLeave(io, socket, meetingId) {
  if (!socket || !meetingId) return;

  const room = roomUsers.get(meetingId);
  if (!room) return;

  const userInfo = room.get(socket.id) || {};
  room.delete(socket.id);

  if (room.size === 0) {
    roomUsers.delete(meetingId);
  }

  // Notify remaining users
  socket.to(meetingId).emit('user-left', {
    socketId: socket.id,
    ...userInfo
  });

  socket.leave(meetingId);
  socketToRoom.delete(socket.id);

  // Update participant list
  if (room.size > 0) {
    broadcastParticipants(io, meetingId);
  }

  console.log(`User ${userInfo.userName || socket.id} left room ${meetingId}. Room size: ${room.size}`);
}

function broadcastParticipants(io, meetingId) {
  const room = roomUsers.get(meetingId);
  if (!room) return;

  const participants = Array.from(room.entries()).map(([sid, info]) => ({
    socketId: sid,
    ...info
  }));

  io.to(meetingId).emit('participant-update', { participants });
}

module.exports = { initSocket };
