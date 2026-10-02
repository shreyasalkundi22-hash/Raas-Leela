/**
 * Server-Side Admin Authentication Guard
 * 
 * Cryptographically verifies admin session tokens using HMAC-SHA256.
 * Completely stateless & resilient across Netlify Lambda container lifecycles.
 */

const crypto = require('crypto');

// SHA-256 hash of exact case-sensitive password 'rl20206'
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'd3778c56ec11500849532666e99ef708ad3e2dfb4935366ffbf8844dd16a5260';

// Secret key for HMAC signing session tokens
const SIGNING_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_SIGNING_SECRET || 'raas_leela_admin_secure_hmac_2026';

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function createAdminSessionToken() {
  const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24-hour session
  const payload = `admin:${expiry}`;
  const sig = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return `adm_${expiry}_${sig}`;
}

function verifyAdminSession(eventOrToken) {
  let token = '';
  if (typeof eventOrToken === 'string') {
    token = eventOrToken;
  } else if (eventOrToken && eventOrToken.headers) {
    const authHeader = eventOrToken.headers.authorization || eventOrToken.headers.Authorization || '';
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token && eventOrToken.headers['x-admin-token']) {
      token = eventOrToken.headers['x-admin-token'].trim();
    }
    if (!token && eventOrToken.queryStringParameters) {
      token = (eventOrToken.queryStringParameters.token || '').trim();
    }
  }

  if (!token || !token.startsWith('adm_')) {
    return false;
  }

  const parts = token.split('_');
  if (parts.length !== 3) {
    return false;
  }

  const expiry = parseInt(parts[1], 10);
  if (isNaN(expiry) || expiry < Date.now()) {
    return false; // Token expired
  }

  const sig = parts[2];
  const payload = `admin:${expiry}`;
  const expectedSig = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

module.exports = {
  ADMIN_PASSWORD_HASH,
  sha256,
  createAdminSessionToken,
  verifyAdminSession
};
