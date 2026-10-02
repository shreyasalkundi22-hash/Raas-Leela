/**
 * Netlify Function: redeem-ticket
 * 
 * Gate Staff Check-In Redemption Endpoint for RAAS LEELA 2026.
 * Executed ONLY when staff explicitly presses 'ADMIT & CLOSE TICKET'.
 * 
 * CRITICAL RULE (Section 11):
 * Uses atomic PostgreSQL row-level locking (FOR UPDATE) so two gate staff phones
 * cannot successfully admit the same ticket simultaneously.
 */

const { rpc, getSupabaseConfig } = require('./supabase-client');

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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'METHOD_NOT_ALLOWED' })
    };
  }

  const config = getSupabaseConfig();
  if (!config.configured) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'DATABASE_CONFIGURATION_REQUIRED', message: config.error })
    };
  }

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
      body: JSON.stringify({ success: false, error: 'INVALID_JSON_BODY', message: 'Malformed JSON payload.' })
    };
  }

  const token = String(payload.token || payload.ticketId || '').trim();
  const actor = String(payload.staffName || 'GATE_STAFF').trim();

  if (!token) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'TOKEN_REQUIRED', message: 'Ticket verification token or ID is required.' })
    };
  }

  try {
    const result = await rpc('redeem_ticket_atomic', {
      p_token: token,
      p_actor: actor
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('[redeem-ticket] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'REDEMPTION_FAILED',
        message: 'Could not redeem ticket in database: ' + err.message
      })
    };
  }
};
