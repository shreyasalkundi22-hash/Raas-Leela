/**
 * Netlify Function: retrieve-ticket
 * 
 * Allows customers to retrieve their pass status and verified digital ticket
 * using their Booking ID and registered Phone Number.
 * Calls Supabase stored procedure: retrieve_booking_tickets_secure.
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

  let bookingId = '';
  let phone = '';

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    bookingId = params.bookingId || params.id || '';
    phone = params.phone || '';
  } else if (event.httpMethod === 'POST') {
    let payload = {};
    try {
      let bodyRaw = event.body || '{}';
      if (event.isBase64Encoded) {
        bodyRaw = Buffer.from(bodyRaw, 'base64').toString('utf8');
      }
      payload = JSON.parse(bodyRaw);
    } catch (e) {}
    bookingId = payload.bookingId || payload.id || '';
    phone = payload.phone || '';
  } else {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'METHOD_NOT_ALLOWED' })
    };
  }

  const cleanId = String(bookingId || '').trim();
  const cleanPhone = String(phone || '').trim();

  if (!cleanId || cleanId.length < 5) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'BOOKING_ID_REQUIRED', message: 'Booking ID is required.' })
    };
  }

  if (!cleanPhone || cleanPhone.length < 8) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'PHONE_REQUIRED',
        message: 'Registered WhatsApp / phone number is required to verify identity.'
      })
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
    const result = await rpc('retrieve_booking_tickets_secure', {
      p_booking_id: cleanId,
      p_phone: cleanPhone
    });

    if (!result || !result.success) {
      const status = result && result.error === 'BOOKING_NOT_FOUND' ? 404 : 400;
      return {
        statusCode: status,
        headers: CORS_HEADERS,
        body: JSON.stringify(result || { success: false, error: 'NOT_FOUND' })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(result)
    };

  } catch (err) {
    console.error('[retrieve-ticket] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'RETRIEVAL_FAILED',
        message: 'Could not retrieve ticket from database: ' + err.message
      })
    };
  }
};
