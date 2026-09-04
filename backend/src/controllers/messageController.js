const Message = require('../models/Message');
const Meeting = require('../models/Meeting');

// GET /api/messages/:meetingId — Get messages for a meeting
const getMessages = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const messages = await Message.find({ meetingId })
      .sort({ createdAt: 1 })
      .limit(500);

    res.json({ messages });
  } catch (error) {
    console.error('getMessages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// POST /api/messages — Save a message
const saveMessage = async (req, res) => {
  try {
    const { meetingId, message, senderName } = req.body;
    const senderId = req.auth.userId;

    if (!meetingId || !message || !message.trim()) {
      return res.status(400).json({ error: 'meetingId and message are required' });
    }

    const newMessage = new Message({
      meetingId,
      senderId,
      senderName: senderName || 'Unknown',
      message: message.trim()
    });

    await newMessage.save();
    res.status(201).json({ message: newMessage });
  } catch (error) {
    console.error('saveMessage error:', error);
    res.status(500).json({ error: 'Failed to save message' });
  }
};

module.exports = { getMessages, saveMessage };
