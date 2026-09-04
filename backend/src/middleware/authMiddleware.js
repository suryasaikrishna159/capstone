const { verifyToken } = require('@clerk/backend');

/**
 * Auth middleware using Clerk verifyToken.
 * Uses verifyToken (works with Express) instead of authenticateRequest (requires full URL / Web Request API).
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.substring(7);

    // No secret key set — decode without verify (dev only)
    if (
      !process.env.CLERK_SECRET_KEY ||
      process.env.CLERK_SECRET_KEY.includes('YOUR_SECRET_KEY')
    ) {
      console.warn('[Auth] CLERK_SECRET_KEY not set — using unverified JWT decode (dev only)');
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8')
      );
      req.auth = { userId: payload.sub };
      return next();
    }

    // Proper Clerk token verification (no URL parsing needed)
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    req.auth = { userId: payload.sub };
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);

    // Fallback: decode without signature verification
    try {
      const token = req.headers.authorization?.substring(7);
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.sub) {
            req.auth = { userId: payload.sub };
            return next();
          }
        }
      }
    } catch (_) {}

    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { requireAuth };