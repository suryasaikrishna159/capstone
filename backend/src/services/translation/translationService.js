/**
 * translationService.js
 * Wraps the MyMemory free REST API.
 * No API key required for ≤1000 req/day.
 * Set MYMEMORY_EMAIL in .env for 10 000 req/day.
 */
const https = require('https');

const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || '';
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 min
const REQUEST_TIMEOUT_MS = 6000;

// ── In-memory cache ────────────────────────────────────────────────────────
const cache = new Map(); // key → { translatedText, ts }

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
  }
}, 60_000);

// ── Core function ──────────────────────────────────────────────────────────
async function translateText(text, sourceLang, targetLang) {
  if (!text || !text.trim()) return { translatedText: '', latency: 0 };
  if (sourceLang === targetLang)
    return { translatedText: text.trim(), latency: 0, fromCache: true };

  const trimmed = text.trim().slice(0, 500); // max 500 chars to control cost
  const cacheKey = `${sourceLang}|${targetLang}|${trimmed}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    console.log(`[Translation] Cache hit ${sourceLang}→${targetLang}`);
    return { translatedText: hit.translatedText, latency: 0, fromCache: true };
  }

  const startTime = Date.now();
  const langPair   = `${sourceLang}|${targetLang}`;
  const emailParam = MYMEMORY_EMAIL ? `&de=${encodeURIComponent(MYMEMORY_EMAIL)}` : '';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${langPair}${emailParam}`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[Translation] Timeout');
      resolve({ translatedText: trimmed, latency: REQUEST_TIMEOUT_MS, error: 'timeout' });
    }, REQUEST_TIMEOUT_MS);

    https.get(url, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(raw);
          // MyMemory returns 200 for quota exceeded with responseStatus 403
          if (json.responseStatus && json.responseStatus !== 200) {
            console.warn('[Translation] MyMemory status', json.responseStatus, json.responseDetails);
            resolve({ translatedText: trimmed, latency: Date.now() - startTime, error: json.responseDetails });
            return;
          }
          const translatedText = json.responseData?.translatedText || trimmed;
          const latency = Date.now() - startTime;
          cache.set(cacheKey, { translatedText, ts: Date.now() });
          console.log(`[Translation] ${sourceLang}→${targetLang} in ${latency}ms`);
          resolve({ translatedText, latency });
        } catch (e) {
          resolve({ translatedText: trimmed, latency: Date.now() - startTime, error: e.message });
        }
      });
    }).on('error', (e) => {
      clearTimeout(timer);
      console.error('[Translation] HTTP error:', e.message);
      resolve({ translatedText: trimmed, latency: Date.now() - startTime, error: e.message });
    });
  });
}

module.exports = { translateText };