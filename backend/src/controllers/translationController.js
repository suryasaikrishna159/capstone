const { translateText } = require('../services/translation/translationService');
const Transcript = require('../models/Transcript');

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English',    nativeName: 'English',    speechCode: 'en-US' },
  { code: 'te', name: 'Telugu',     nativeName: 'తెలుగు',      speechCode: 'te-IN' },
  { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी',      speechCode: 'hi-IN' },
  { code: 'ta', name: 'Tamil',      nativeName: 'தமிழ்',       speechCode: 'ta-IN' },
  { code: 'kn', name: 'Kannada',    nativeName: 'ಕನ್ನಡ',       speechCode: 'kn-IN' },
  { code: 'ml', name: 'Malayalam',  nativeName: 'മലയാളം',      speechCode: 'ml-IN' },
  { code: 'bn', name: 'Bengali',    nativeName: 'বাংলা',        speechCode: 'bn-IN' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',     speechCode: 'es-ES' },
  { code: 'fr', name: 'French',     nativeName: 'Français',    speechCode: 'fr-FR' },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',     speechCode: 'de-DE' },
  { code: 'ja', name: 'Japanese',   nativeName: '日本語',        speechCode: 'ja-JP' },
  { code: 'ko', name: 'Korean',     nativeName: '한국어',        speechCode: 'ko-KR' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',          speechCode: 'zh-CN' },
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',      speechCode: 'ar-SA' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português',   speechCode: 'pt-BR' },
  { code: 'ru', name: 'Russian',    nativeName: 'Русский',      speechCode: 'ru-RU' },
];

async function translate(req, res) {
  const { text, sourceLanguage, targetLanguage } = req.body;
  if (!text || !sourceLanguage || !targetLanguage)
    return res.status(400).json({ error: 'text, sourceLanguage, targetLanguage required' });
  if (text.length > 1000)
    return res.status(400).json({ error: 'text too long (max 1000 chars)' });
  try {
    const result = await translateText(text, sourceLanguage, targetLanguage);
    res.json(result);
  } catch (err) {
    console.error('[Translation Controller]', err.message);
    res.status(500).json({ error: 'Translation failed' });
  }
}

function getLanguages(req, res) {
  res.json({ languages: SUPPORTED_LANGUAGES });
}

async function getMeetingTranscript(req, res) {
  try {
    const transcripts = await Transcript.find({ meetingId: req.params.meetingId })
      .sort({ timestamp: 1 })
      .limit(500)
      .lean();
    res.json({ transcripts });
  } catch (err) {
    console.error('[Transcript]', err.message);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
}

module.exports = { translate, getLanguages, getMeetingTranscript, SUPPORTED_LANGUAGES };