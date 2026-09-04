const mongoose = require('mongoose');

const ParticipantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null }
}, { _id: false });

const MeetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  hostId: {
    type: String,
    required: true
  },
  hostName: {
    type: String,
    required: true
  },
  participants: [ParticipantSchema],
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended'],
    default: 'scheduled'
  },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('Meeting', MeetingSchema);
