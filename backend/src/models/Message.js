const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: String,
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', MessageSchema);
