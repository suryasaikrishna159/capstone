/**
 * translationSocketHandler.js
 *
 * Handles all real-time multilingual events.
 * Called from socketHandler.js inside io.on("connection").
 *
 * Socket events handled:
 *   language-updated    client → server  { meetingId, spokenLang, listeningLang }
 *   transcript-partial  client → server  { meetingId, utteranceId, speakerId, speakerName, sourceText, sourceLang }
 *   transcript-final    client → server  { meetingId, utteranceId, speakerId, speakerName, sourceText, sourceLang }
 *   speaker-speaking    client → server  { meetingId, isSpeaking }
 *
 * Socket events emitted:
 *   transcript-partial  server → room    { utteranceId, speakerId, speakerName, sourceText, sourceLang, timestamp }
 *   transcript-final    server → room    same fields
 *   translation-complete server → client { utteranceId, speakerId, speakerName, sourceText, sourceLang, translatedText, targetLang, latency, timestamp }
 *   translation-error   server → room    { utteranceId, error }
 *   speaker-update      server → room    { socketId, isSpeaking }
 */

const { translateText } = require('../services/translation/translationService');
const Transcript = require('../models/Transcript');

// socketId → { spokenLang, listeningLang, meetingId, speakerName }
const userLanguages = new Map();

// Rate-limit: socketId → last transcript-final timestamp
const lastFinalTime = new Map();
const FINAL_MIN_INTERVAL_MS = 300; // no more than ~3 finals/sec per user

function initTranslationHandlers(io, socket, roomUsers) {
  // ── Language preference ──────────────────────────────────────────────────
  socket.on('language-updated', ({ meetingId, spokenLang, listeningLang } = {}) => {
    if (!meetingId || !spokenLang || !listeningLang) return;
    const existing = userLanguages.get(socket.id) || {};
    userLanguages.set(socket.id, { ...existing, spokenLang, listeningLang, meetingId });
    console.log(`[Translation] ${socket.id} speaks=${spokenLang} hears=${listeningLang}`);
  });

  // ── Partial transcript (display only, no translation) ────────────────────
  socket.on('transcript-partial', ({ meetingId, utteranceId, speakerId, speakerName, sourceText, sourceLang, timestamp } = {}) => {
    if (!meetingId || !sourceText) return;
    socket.to(meetingId).emit('transcript-partial', {
      utteranceId, speakerId, speakerName, sourceText, sourceLang,
      timestamp: timestamp || Date.now()
    });
  });

  // ── Final transcript → translate → deliver ───────────────────────────────
  socket.on('transcript-final', async ({ meetingId, utteranceId, speakerId, speakerName, sourceText, sourceLang, timestamp } = {}) => {
    if (!meetingId || !sourceText || !sourceText.trim()) return;

    // Rate limiting: relax to 150ms so natural pauses aren't discarded
    const now = Date.now();
    if (now - (lastFinalTime.get(socket.id) || 0) < 150) return;
    lastFinalTime.set(socket.id, now);

    const ts = timestamp || now;
    const cleanText = sourceText.trim();
    const cleanLang = sourceLang || 'en';

    console.log(`[Transcript Final] from ${speakerName || 'User'}(${socket.id}) in ${meetingId}: "${cleanText}" [${cleanLang}]`);

    // Broadcast final transcript to everyone in room for real-time display
    io.to(meetingId).emit('transcript-final', {
      utteranceId, speakerId, speakerName, sourceText: cleanText, sourceLang: cleanLang, timestamp: ts
    });

    // Find all target languages needed in this room
    const room = roomUsers.get(meetingId);
    const targetLangs = new Set();

    if (room) {
      for (const [sid] of room.entries()) {
        const pref = userLanguages.get(sid);
        if (pref?.listeningLang && pref.listeningLang !== cleanLang) {
          targetLangs.add(pref.listeningLang);
        }
      }
    }

    // Also check the speaker's own preference
    const speakerPref = userLanguages.get(socket.id);
    if (speakerPref?.listeningLang && speakerPref.listeningLang !== cleanLang) {
      targetLangs.add(speakerPref.listeningLang);
    }

    // Default target language if none configured yet
    if (targetLangs.size === 0) {
      if (cleanLang === 'en') targetLangs.add('te');
      else targetLangs.add('en');
    }

    // Translate in parallel for each unique target language
    const translationResults = [];
    await Promise.all(
      [...targetLangs].map(async (targetLang) => {
        console.log(`[Translation] Translating "${cleanText}" ${cleanLang} → ${targetLang}`);
        const result = await translateText(cleanText, cleanLang, targetLang);
        console.log(`[Translation] Done (${cleanLang}→${targetLang}): "${result.translatedText}" in ${result.latency}ms`);
        translationResults.push({ targetLang, ...result });

        // Broadcast translated text to entire room so everyone sees it in the transcript panel
        io.to(meetingId).emit('translation-complete', {
          utteranceId, speakerId, speakerName,
          sourceText: cleanText, sourceLang: cleanLang,
          translatedText: result.translatedText,
          targetLang,
          latency: result.latency || 0,
          fromCache: result.fromCache || false,
          error: result.error || null,
          timestamp: ts
        });
      })
    );

    // Persist final transcript to MongoDB (best-effort, non-blocking)
    Transcript.create({
      meetingId, utteranceId, speakerId, speakerName,
      sourceLanguage: cleanLang, sourceText: cleanText,
      translations: translationResults
        .filter(r => r.translatedText && !r.error)
        .map(r => ({ targetLanguage: r.targetLang, translatedText: r.translatedText, latency: r.latency })),
      timestamp: new Date(ts)
    }).catch(err => console.error('[Translation] DB persist failed:', err.message));
  });

  // ── Speaking indicator ───────────────────────────────────────────────────
  socket.on('speaker-speaking', ({ meetingId, isSpeaking } = {}) => {
    if (!meetingId) return;
    socket.to(meetingId).emit('speaker-update', { socketId: socket.id, isSpeaking: !!isSpeaking });
  });
}

function cleanupTranslationUser(socketId) {
  userLanguages.delete(socketId);
  lastFinalTime.delete(socketId);
}

module.exports = { initTranslationHandlers, cleanupTranslationUser };