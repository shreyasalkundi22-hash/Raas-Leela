/**
 * Netlify Function: verify-ticket
 * 
 * Gate Staff & Public Ticket Scanner Inspection for RAAS LEELA 2026.
 * Performs READ-ONLY inspection against Supabase.
 * 
 * CRITICAL RULE (Section 11):
 * Scanning alone does NOT redeem the ticket.
 * Displays attendee details and readiness status to staff.
 * Staff must explicitly press 'ADMIT & CLOSE TICKET' to redeem.
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

  let token = '';

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    token = params.token || params.ticketId || params.id || '';
  } else if (event.httpMethod === 'POST') {
    let payload = {};
    try {
      let bodyRaw = event.body || '{}';
      if (event.isBase64Encoded) {
        bodyRaw = Buffer.from(bodyRaw, 'base64').toString('utf8');
      }
      payload = JSON.parse(bodyRaw);
    } catch (e) {}
    token = payload.token || payload.ticketId || payload.id || '';
  }

  const clean = String(token || '').trim();

  if (!clean) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'TOKEN_REQUIRED', message: 'Verification token is required.' })
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

  try {
    const result = await rpc('inspect_ticket_for_staff', { p_token: clean });
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('[verify-ticket] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INSPECTION_FAILED',
        message: 'Could not inspect ticket in database: ' + err.message
      })
    };
  }
};
