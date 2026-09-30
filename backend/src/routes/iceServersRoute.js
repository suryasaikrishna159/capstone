/**
 * iceServersRoute.js
 * 
 * Backend proxy for ICE/TURN server credentials.
 * The frontend calls this endpoint instead of Metered directly so:
 *  - API keys stay server-side (not in the JS bundle)
 *  - TURN providers can be changed by updating Render env vars (no frontend redeploy)
 *  - Multiple providers are merged into one response for maximum reliability
 */
const express = require('express');
const router  = express.Router();

const METERED_DOMAIN  = process.env.METERED_DOMAIN  || 'cpastoneproj.metered.live';
const METERED_API_KEY = process.env.METERED_API_KEY || '9e61710f50cea9c034ff77d7e8d8ca300d25';

// OpenRelay: completely free, no account, no quota.
// Used as the primary relay so Metered quota is not a concern.
const OPEN_RELAY_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
];

// Cache Metered credentials for 5 min (they are static anyway on free plan)
let cachedMetered = null;
let cacheExpiry   = 0;

async function fetchMeteredServers() {
  if (cachedMetered && Date.now() < cacheExpiry) return cachedMetered;
  try {
    const res = await fetch(
      `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length > 0) {
      cachedMetered = servers;
      cacheExpiry   = Date.now() + 5 * 60 * 1000;
      return servers;
    }
  } catch (err) {
    console.warn('[ICE] Metered fetch failed:', err.message);
  }
  return [];
}

// GET /api/ice-servers
router.get('/', async (req, res) => {
  const meteredServers = await fetchMeteredServers();

  // Merge: OpenRelay first (primary relay), then Metered (secondary relay)
  const iceServers = [...OPEN_RELAY_SERVERS, ...meteredServers];

  res.json({ iceServers });
});

module.exports = router;
