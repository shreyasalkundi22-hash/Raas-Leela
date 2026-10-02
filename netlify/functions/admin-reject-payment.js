/**
 * Netlify Function: admin-reject-payment
 * 
 * Secure Admin Endpoint: Rejects an invalid or unverified booking,
 * sets payment_status to 'PAYMENT_REJECTED', ticket_status to 'NOT_ISSUED'.
 * Protected by admin session token.
 */

const { verifyAdminSession } = require('./admin-guard');
const { rpc, getSupabaseConfig } = require('./supabase-client');

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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'METHOD_NOT_ALLOWED' })
    };
  }

  // 1. Authenticate Admin
  if (!verifyAdminSession(event)) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Admin authentication required.' })
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

  const bookingId = String(payload.bookingId || '').trim().toUpperCase();
  const reason = String(payload.reason || 'Payment could not be verified by organizer').trim();

  if (!bookingId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'BOOKING_ID_REQUIRED', message: 'Booking ID is required.' })
    };
  }

  try {
    const result = await rpc('reject_payment_atomic', {
      p_booking_id: bookingId,
      p_actor: 'ADMIN',
      p_reason: reason
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error('[admin-reject-payment] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'REJECTION_FAILED',
        message: 'Could not reject payment: ' + err.message
      })
    };
  }
};
