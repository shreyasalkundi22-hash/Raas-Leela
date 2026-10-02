/**
 * Netlify Function: create-booking
 * 
 * Creates a new booking in Supabase with status 'AWAITING_PAYMENT'.
 * Strictly enforces server-side pricing:
 *   - Stag: ₹299 (1 person)
 *   - Couple: ₹499 (2 people)
 *   - Group of 5: ₹1,199 (5 people)
 * Generates an unpredictable Booking ID: e.g. RL-XXXXXXXX
 */

const crypto = require('crypto');
const { insertIntoTable, getSupabaseConfig } = require('./supabase-client');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

const PASS_CATALOG = {
  stag: { tier: 'stag', pass_name: 'STAG PASS', unit_price: 299, admit_per_pass: 1 },
  couple: { tier: 'couple', pass_name: 'COUPLE PASS', unit_price: 499, admit_per_pass: 2 },
  group: { tier: 'group', pass_name: 'GROUP OF 5', unit_price: 1199, admit_per_pass: 5 }
};

function normalizeTier(tierStr) {
  if (!tierStr) return null;
  const clean = String(tierStr).trim().toLowerCase();
  if (clean === 'stag' || clean.includes('stag')) return 'stag';
  if (clean === 'couple' || clean.includes('couple')) return 'couple';
  if (clean === 'group' || clean.includes('group') || clean.includes('5')) return 'group';
  return null;
}

function generateUnpredictableBookingId() {
  // Generates RL- followed by 8 cryptographically random alphanumeric digits
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = crypto.randomBytes(8);
  let code = 'RL-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(buf[i] % chars.length);
  }
  return code;
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

  // Check Supabase Configuration
  const config = getSupabaseConfig();
  if (!config.configured) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'DATABASE_CONFIGURATION_REQUIRED',
        missing: config.missing,
        message: config.error
      })
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

  const { tier, qty, customerName, customerPhone, customerEmail } = payload;

  const validTier = normalizeTier(tier);
  if (!validTier || !PASS_CATALOG[validTier]) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INVALID_PASS_TIER',
        message: 'Invalid pass tier selected. Must be Stag, Couple, or Group of 5.'
      })
    };
  }

  const rawQty = parseInt(qty, 10);
  const quantity = (!isNaN(rawQty) && rawQty >= 1) ? Math.min(rawQty, 20) : 1;

  const name = String(customerName || '').trim().substring(0, 80);
  const phone = String(customerPhone || '').trim().replace(/[^0-9]/g, '').substring(0, 15);
  const email = customerEmail ? String(customerEmail).trim().substring(0, 100) : null;

  if (!name || name.length < 2) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'NAME_REQUIRED', message: 'Full name is required.' })
    };
  }

  if (!phone || phone.length < 10) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'PHONE_REQUIRED', message: 'Valid 10-digit WhatsApp number is required.' })
    };
  }

  // Server-determined immutable pricing
  const passInfo = PASS_CATALOG[validTier];
  const unitPrice = passInfo.unit_price;
  const admitPerPass = passInfo.admit_per_pass;
  const expectedAmount = unitPrice * quantity;
  const totalAdmit = admitPerPass * quantity;
  const bookingId = generateUnpredictableBookingId();

  const bookingRecord = {
    id: bookingId,
    customer_name: name,
    phone: phone,
    email: email,
    tier: validTier,
    pass_name: passInfo.pass_name,
    quantity: quantity,
    admit_per_pass: admitPerPass,
    total_admit: totalAdmit,
    unit_price: unitPrice,
    expected_amount: expectedAmount,
    payment_status: 'AWAITING_PAYMENT',
    ticket_status: 'NOT_ISSUED'
  };

  try {
    const inserted = await insertIntoTable('bookings', bookingRecord);
    
    // Log in audit table
    try {
      await insertIntoTable('audit_logs', {
        booking_id: bookingId,
        action: 'BOOKING_CREATED',
        actor: 'CUSTOMER',
        details: { tier: validTier, quantity, expectedAmount, totalAdmit }
      });
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        booking: {
          id: bookingId,
          customerName: name,
          phone: phone,
          email: email,
          tier: validTier,
          passName: passInfo.pass_name,
          quantity: quantity,
          unitPrice: unitPrice,
          expectedAmount: expectedAmount,
          admitPerPass: admitPerPass,
          totalAdmit: totalAdmit,
          paymentStatus: 'AWAITING_PAYMENT',
          ticketStatus: 'NOT_ISSUED',
          createdAt: new Date().toISOString()
        }
      })
    };
  } catch (dbErr) {
    console.error('[create-booking] Database insert error:', dbErr);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Could not record booking in database. ' + dbErr.message
      })
    };
  }
};
