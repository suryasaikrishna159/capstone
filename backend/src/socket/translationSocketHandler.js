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

    // Rate limiting
    const now = Date.now();
    if (now - (lastFinalTime.get(socket.id) || 0) < FINAL_MIN_INTERVAL_MS) return;
    lastFinalTime.set(socket.id, now);

    const ts = timestamp || now;

    // Broadcast final transcript to everyone in room for display
    io.to(meetingId).emit('transcript-final', {
      utteranceId, speakerId, speakerName, sourceText, sourceLang, timestamp: ts
    });

    // Find all listeners who need a different language
    const room = roomUsers.get(meetingId);
    if (!room) return;

    // Build targetLang → [socketId] map (skip speaker, skip same-language listeners)
    const targetGroups = new Map(); // targetLang → [socketId]
    for (const [sid] of room.entries()) {
      if (sid === socket.id) continue; // don't send translation back to speaker
      const pref = userLanguages.get(sid);
      if (!pref?.listeningLang) continue;
      if (pref.listeningLang === sourceLang) continue; // same language — no translation needed
      const tl = pref.listeningLang;
      if (!targetGroups.has(tl)) targetGroups.set(tl, []);
      targetGroups.get(tl).push(sid);
    }

    if (targetGroups.size === 0) return; // nothing to translate

    // Translate in parallel for each unique target language
    const translationResults = [];
    await Promise.all(
      [...targetGroups.entries()].map(async ([targetLang, socketIds]) => {
        console.log(`[Translation] ${sourceLang}→${targetLang} for ${socketIds.length} listener(s)`);
        const result = await translateText(sourceText.trim(), sourceLang, targetLang);
        translationResults.push({ targetLang, socketIds, ...result });

        // Deliver to each listener
        for (const sid of socketIds) {
          io.to(sid).emit('translation-complete', {
            utteranceId, speakerId, speakerName,
            sourceText, sourceLang,
            translatedText: result.translatedText,
            targetLang,
            latency: result.latency || 0,
            fromCache: result.fromCache || false,
            error: result.error || null,
            timestamp: ts
          });
        }
      })
    );

    // Persist final transcript to MongoDB (best-effort, non-blocking)
    Transcript.create({
      meetingId, utteranceId, speakerId, speakerName,
      sourceLanguage: sourceLang, sourceText: sourceText.trim(),
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