/**
 * iceServersRoute.js
 *
 * Serves merged ICE/TURN server list to the frontend.
 * Priority order:
 *   1. OpenRelay (free, no quota) — always included
 *   2. Metered dynamic credentials (fetched via METERED_API_KEY env var)
 *   3. Hardcoded Metered fallback (cpastoneproj account — static credentials)
 *
 * To update TURN credentials: change METERED_DOMAIN + METERED_API_KEY
 * in Render Environment Variables and redeploy — no frontend change needed.
 */
const express = require('express');
const router  = express.Router();

const METERED_DOMAIN  = process.env.METERED_DOMAIN  || 'cpastoneproj.metered.live';
const METERED_API_KEY = process.env.METERED_API_KEY || '9e61710f50cea9c034ff77d7e8d8ca300d25';

// OpenRelay: completely free, no account, no quota limit.
// Includes TURNS (TLS) on port 443 which passes through strict firewalls.
const OPEN_RELAY_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  // UDP TURN
  { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
  // TCP TURN (bypasses UDP-blocking firewalls)
  { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  // TLS TURN on 443 — passes through virtually all firewalls
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

// cpastoneproj static fallback — TURN API still returns HTTP 200 with these.
// Even if bandwidth is partially exhausted, new sessions may still relay.
const METERED_STATIC_FALLBACK = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80',                 username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp',   username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turn:global.relay.metered.ca:443',                username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'cf415c4afb57e187396489cf', credential: 'kDLev5KEqR5BbYxr' },
];

// Cache Metered dynamic credentials for 5 minutes
let cachedMetered = null;
let cacheExpiry   = 0;

async function fetchMeteredServers() {
  if (cachedMetered && Date.now() < cacheExpiry) return cachedMetered;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[ICE] Metered API returned ${res.status} — using static fallback`);
      return [];
    }
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length > 0) {
      cachedMetered = servers;
      cacheExpiry   = Date.now() + 5 * 60 * 1000;
      console.log(`[ICE] Fetched ${servers.length} Metered TURN servers from ${METERED_DOMAIN}`);
      return servers;
    }
  } catch (err) {
    console.warn('[ICE] Metered fetch failed:', err.message);
  }
  return [];
}

// GET /api/ice-servers
router.get('/', async (req, res) => {
  const meteredDynamic = await fetchMeteredServers();

  // Always include: OpenRelay (primary) + Metered dynamic (if available) + Metered static fallback
  const iceServers = [
    ...OPEN_RELAY_SERVERS,
    ...(meteredDynamic.length > 0 ? meteredDynamic : METERED_STATIC_FALLBACK),
  ];

  console.log(`[ICE] Serving ${iceServers.length} ICE servers to client`);
  res.json({ iceServers });
});

module.exports = router;
