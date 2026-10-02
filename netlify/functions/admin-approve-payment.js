/**
 * Netlify Function: admin-approve-payment
 * 
 * Secure Admin Endpoint: Approves a pending booking payment,
 * transitions payment_status to 'PAYMENT_VERIFIED', sets ticket_status to 'ACTIVE',
 * and mints unique ticket IDs & QR verification tokens in Supabase.
 * Protected by admin session token.
 */

const crypto = require('crypto');
const { verifyAdminSession } = require('./admin-guard');
const { rpc, fromTable, getSupabaseConfig } = require('./supabase-client');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Admin-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

function generateUniqueTicketId() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = crypto.randomBytes(6);
  let code = 'RL-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(buf[i] % chars.length);
  }
  return code;
}

function generateSecureToken(prefix = 'rlv_') {
  return prefix + crypto.randomBytes(16).toString('hex');
}

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

  if (!bookingId) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'BOOKING_ID_REQUIRED', message: 'Booking ID is required.' })
    };
  }

  try {
    // 2. Fetch booking to determine exact quantity
    const rows = await fromTable('bookings', `id=eq.${encodeURIComponent(bookingId)}`);
    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'BOOKING_NOT_FOUND', message: 'Booking ID not found.' })
      };
    }

    const booking = rows[0];
    const qty = booking.quantity || 1;

    // 3. Generate unique ticket records for each pass under this booking
    const ticketList = [];
    for (let i = 1; i <= qty; i++) {
      ticketList.push({
        id: generateUniqueTicketId(),
        pass_index: i,
        pass_number: `${i} of ${qty}`,
        verify_token: generateSecureToken('rlv_')
      });
    }

    // 4. Call atomic approval procedure in Supabase
    const result = await rpc('approve_payment_atomic', {
      p_booking_id: bookingId,
      p_actor: 'ADMIN',
      p_ticket_list: ticketList
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error('[admin-approve-payment] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'APPROVAL_FAILED',
        message: 'Could not approve payment: ' + err.message
      })
    };
  }
};
