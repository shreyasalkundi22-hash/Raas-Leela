/**
 * Netlify Function: submit-payment
 * 
 * Submits the customer's UPI Reference / UTR for organizer verification.
 * Transitions booking payment_status to 'PENDING_VERIFICATION'.
 * 
 * IMPORTANT:
 * Submitting this claim does NOT mean payment was verified.
 * Ticket status remains strictly 'NOT_ISSUED' until an organizer manually approves.
 */

const { fromTable, updateTable, insertIntoTable, getSupabaseConfig } = require('./supabase-client');

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

  const bookingId = String(payload.bookingId || '').trim().toUpperCase();
  const upiReference = String(payload.upiReference || '').trim();
  const phone = payload.phone ? String(payload.phone).trim().replace(/[^0-9]/g, '') : '';

  if (!bookingId || bookingId.length < 5) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'BOOKING_ID_REQUIRED', message: 'Valid Booking ID is required.' })
    };
  }

  if (!upiReference || upiReference.length < 4) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'UPI_REFERENCE_REQUIRED',
        message: 'Please enter your UPI Transaction / Reference ID (UTR) from your UPI payment app.'
      })
    };
  }

  try {
    // 1. Fetch current booking from Supabase
    const rows = await fromTable('bookings', `id=eq.${encodeURIComponent(bookingId)}`);
    if (!rows || rows.length === 0) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: false, error: 'BOOKING_NOT_FOUND', message: 'Booking ID not found.' })
      };
    }

    const booking = rows[0];

    // If already verified, inform user
    if (booking.payment_status === 'PAYMENT_VERIFIED') {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          alreadyVerified: true,
          bookingId: booking.id,
          paymentStatus: 'PAYMENT_VERIFIED',
          ticketStatus: booking.ticket_status,
          message: 'Payment for this booking has already been verified and tickets are active!'
        })
      };
    }

    const nowIso = new Date().toISOString();

    // 2. Update booking to PENDING_VERIFICATION
    await updateTable('bookings', `id=eq.${encodeURIComponent(bookingId)}`, {
      upi_reference: upiReference,
      payment_status: 'PENDING_VERIFICATION',
      ticket_status: 'NOT_ISSUED',
      payment_submitted_at: nowIso
    });

    // 3. Record in audit log
    try {
      await insertIntoTable('audit_logs', {
        booking_id: bookingId,
        action: 'PAYMENT_SUBMITTED',
        actor: 'CUSTOMER',
        details: {
          upi_reference: upiReference,
          expected_amount: booking.expected_amount,
          submitted_at: nowIso
        }
      });
    } catch (auditErr) {
      console.warn('Audit write error:', auditErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        bookingId: booking.id,
        customerName: booking.customer_name,
        passName: booking.pass_name,
        expectedAmount: booking.expected_amount,
        upiReference: upiReference,
        paymentStatus: 'PENDING_VERIFICATION',
        ticketStatus: 'NOT_ISSUED',
        submittedAt: nowIso,
        message: 'Your payment has been submitted for verification. Your ticket will be available after the organizer confirms your payment.'
      })
    };

  } catch (err) {
    console.error('[submit-payment] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Failed to record payment submission in database: ' + err.message
      })
    };
  }
};
