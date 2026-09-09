const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
  targetLanguage: { type: String },
  translatedText: { type: String },
  latency:        { type: Number, default: 0 }
}, { _id: false });

const transcriptSchema = new mongoose.Schema({
  meetingId:      { type: String, required: true, index: true },
  utteranceId:    { type: String, required: true },
  speakerId:      { type: String, required: true },
  speakerName:    { type: String, default: 'Unknown' },
  sourceLanguage: { type: String, required: true },
  sourceText:     { type: String, required: true },
  translations:   [translationSchema],
  timestamp:      { type: Date,   default: Date.now },
  duration:       { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Transcript', transcriptSchema);