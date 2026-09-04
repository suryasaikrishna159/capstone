const Meeting = require('../models/Meeting');
const generateMeetingId = require('../utils/generateMeetingId');

// POST /api/meetings — Create a new meeting
const createMeeting = async (req, res) => {
  try {
    const { title, hostName } = req.body;
    const hostId = req.auth.userId;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Meeting title is required' });
    }
    if (!hostName) {
      return res.status(400).json({ error: 'Host name is required' });
    }

    // Generate unique meeting ID (retry on collision)
    let meetingId;
    let attempts = 0;
    do {
      meetingId = generateMeetingId();
      const existing = await Meeting.findOne({ meetingId });
      if (!existing) break;
      attempts++;
    } while (attempts < 5);

    const meeting = new Meeting({
      meetingId,
      title: title.trim(),
      hostId,
      hostName,
      participants: [],
      status: 'scheduled'
    });

    await meeting.save();
    res.status(201).json({ meeting });
  } catch (error) {
    console.error('createMeeting error:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
};

// GET /api/meetings/:meetingId — Get meeting info
const getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json({ meeting });
  } catch (error) {
    console.error('getMeeting error:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
};

// POST /api/meetings/:meetingId/join — Register participant joining
const joinMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userName } = req.body;
    const userId = req.auth.userId;

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (meeting.status === 'ended') {
      return res.status(400).json({ error: 'This meeting has ended' });
    }

    // Update or add participant
    const existingIdx = meeting.participants.findIndex(p => p.userId === userId);
    if (existingIdx >= 0) {
      meeting.participants[existingIdx].joinedAt = new Date();
      meeting.participants[existingIdx].leftAt = null;
    } else {
      meeting.participants.push({ userId, name: userName || 'Guest', joinedAt: new Date() });
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startedAt = new Date();
    }

    await meeting.save();
    res.json({ meeting });
  } catch (error) {
    console.error('joinMeeting error:', error);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
};

// POST /api/meetings/:meetingId/leave — Register participant leaving
const leaveMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.auth.userId;

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const participant = meeting.participants.find(p => p.userId === userId);
    if (participant) {
      participant.leftAt = new Date();
    }

    await meeting.save();
    res.json({ success: true });
  } catch (error) {
    console.error('leaveMeeting error:', error);
    res.status(500).json({ error: 'Failed to update leave status' });
  }
};

// POST /api/meetings/:meetingId/end — Host ends the meeting
const endMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.auth.userId;

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (meeting.hostId !== userId) {
      return res.status(403).json({ error: 'Only the host can end the meeting' });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();

    // Mark all participants as left
    meeting.participants.forEach(p => {
      if (!p.leftAt) p.leftAt = new Date();
    });

    await meeting.save();
    res.json({ success: true, meeting });
  } catch (error) {
    console.error('endMeeting error:', error);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
};

// GET /api/meetings/user/:userId — Get meeting history for a user
const getUserMeetings = async (req, res) => {
  try {
    const requestingUserId = req.auth.userId;
    const targetUserId = req.params.userId;

    // Users can only see their own history
    if (requestingUserId !== targetUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const meetings = await Meeting.find({
      $or: [
        { hostId: targetUserId },
        { 'participants.userId': targetUserId }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    res.json({ meetings });
  } catch (error) {
    console.error('getUserMeetings error:', error);
    res.status(500).json({ error: 'Failed to fetch meeting history' });
  }
};

module.exports = {
  createMeeting,
  getMeeting,
  joinMeeting,
  leaveMeeting,
  endMeeting,
  getUserMeetings
};
