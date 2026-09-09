/**
 * languages.js  — Central language configuration for MeetSpace V3
 *
 * code        : ISO 639-1 code used by MyMemory translation API
 * speechCode  : BCP-47 code used by Web SpeechRecognition & speechSynthesis
 * name        : English display name
 * nativeName  : Name in that language
 */
export const LANGUAGES = [
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

export function getLanguageByCode(code) {
  return LANGUAGES.find(l => l.code === code) || null;
}

export function getSpeechCode(code) {
  return getLanguageByCode(code)?.speechCode || code;
}