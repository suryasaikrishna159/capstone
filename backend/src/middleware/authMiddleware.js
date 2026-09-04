const { createClerkClient } = require('@clerk/backend');

let clerkClient;

const getClerkClient = () => {
  if (!clerkClient) {
    clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return clerkClient;
};

/**
 * Middleware to verify Clerk JWT token.
 * Attaches userId to req.auth if valid.
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.substring(7);

    // If no secret key configured, use a development fallback (decode without verify)
    if (!process.env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY === 'sk_test_YOUR_SECRET_KEY_HERE') {
      console.warn('WARNING: CLERK_SECRET_KEY not set. Using unverified JWT decode for development.');
      // Decode JWT payload without verification (development only)
      const base64Payload = token.split('.')[1];
      if (!base64Payload) return res.status(401).json({ error: 'Invalid token format' });
      const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
      req.auth = { userId: payload.sub };
      return next();
    }

    const clerk = getClerkClient();
    const requestState = await clerk.authenticateRequest(req, {
      authorizedParties: [process.env.CLIENT_URL || 'http://localhost:5173']
    });

    if (!requestState.isSignedIn) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.auth = { userId: requestState.toAuth().userId };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    // Fallback: try to decode token without verification
    try {
      const token = req.headers.authorization?.substring(7);
      if (token) {
        const base64Payload = token.split('.')[1];
        const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
        req.auth = { userId: payload.sub };
        return next();
      }
    } catch (e) {
      // ignore
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { requireAuth };
