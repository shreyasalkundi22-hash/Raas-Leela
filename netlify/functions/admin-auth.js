/**
 * Netlify Serverless Function: admin-auth
 * 
 * Server-Side Admin Authentication for RAAS LEELA 2026.
 * Validates the exact case-sensitive admin password 'rl20206' using cryptographic SHA-256.
 * Issues stateless HMAC session tokens verified across all serverless endpoints.
 */

const { ADMIN_PASSWORD_HASH, sha256, createAdminSessionToken, verifyAdminSession } = require('./admin-guard');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const path = event.path || '';

  // 1. LOGIN
  if (event.httpMethod === 'POST' && (path.endsWith('/login') || !path.includes('/verify') && !path.includes('/logout'))) {
    let payload = {};
    try {
      let bodyRaw = event.body || '{}';
      if (event.isBase64Encoded) {
        bodyRaw = Buffer.from(bodyRaw, 'base64').toString('utf8');
      }
      payload = JSON.parse(bodyRaw);
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
      const sessionToken = createAdminSessionToken();
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
    if (verifyAdminSession(event)) {
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
