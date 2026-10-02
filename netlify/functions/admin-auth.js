/**
 * Netlify Serverless Function: admin-auth
 * 
 * Server-Side Admin Authentication for RAAS LEELA 2026.
 * 
 * Validates the case-sensitive admin password 'rl20206' using cryptographic SHA-256.
 * Issues secure session tokens for verified admin operations.
 */

const crypto = require('crypto');

// SHA-256 of exact case-sensitive admin password 'rl20206'
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'd3778c56ec11500849532666e99ef708ad3e2dfb4935366ffbf8844dd16a5260';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

const activeSessions = new Set();

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function generateSecureToken(prefix = 'adm_') {
  return prefix + crypto.randomBytes(16).toString('hex');
}

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const path = event.path || '';

  // 1. LOGIN
  if (event.httpMethod === 'POST' && (path.endsWith('/login') || !path.includes('/verify') && !path.includes('/logout'))) {
    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'BAD_REQUEST' })
      };
    }

    const password = payload.password || '';
    const inputHash = sha256(password);

    if (inputHash === ADMIN_PASSWORD_HASH) {
      const sessionToken = generateSecureToken('adm_');
      activeSessions.add(sessionToken);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          message: 'ACCESS GRANTED',
          token: sessionToken
        })
      };
    } else {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'INCORRECT_PASSWORD',
          message: 'ACCESS DENIED'
        })
      };
    }
  }

  // 2. VERIFY SESSION
  if (event.httpMethod === 'GET' || path.endsWith('/verify')) {
    const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token && activeSessions.has(token)) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, authenticated: true })
      };
    }
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'ACCESS_DENIED' })
    };
  }

  // 3. LOGOUT
  if (path.endsWith('/logout')) {
    const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    activeSessions.delete(token);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, message: 'LOGGED_OUT' })
    };
  }

  return {
    statusCode: 404,
    headers: CORS_HEADERS,
    body: JSON.stringify({ success: false, error: 'NOT_FOUND' })
  };
};
