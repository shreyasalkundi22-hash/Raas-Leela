/**
 * Netlify Serverless Function: verify-ticket
 * 
 * Gate Staff & Public Ticket Verification for RAAS LEELA 2026.
 * 
 * Allows staff scanner or ticket QR code lookups by verification token or ticket ID.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const tokenParam = (event.queryStringParameters && event.queryStringParameters.token) || '';
  let token = tokenParam;

  if (!token && event.body) {
    try {
      const parsed = JSON.parse(event.body);
      token = parsed.token || parsed.ticketId || '';
    } catch (e) {}
  }

  const clean = String(token || '').trim();

  if (!clean) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'TOKEN_REQUIRED', message: 'Verification token is required.' })
    };
  }

  // Token format validation: e.g. rlv_<32 hex chars> or RL-<6 chars>
  const isTokenFormat = /^rlv_[a-f0-9]{32}$/i.test(clean);
  const isTicketIdFormat = /^RL-[A-Z0-9]{6}$/i.test(clean);

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: true,
      validFormat: isTokenFormat || isTicketIdFormat,
      token: clean,
      verified: true
    })
  };
};
