/**
 * Netlify Serverless Function: verify-payment
 * 
 * Cryptographic Server-Side Razorpay Payment Verification for RAAS LEELA 2026.
 * 
 * Security & Design Rules:
 * 1. Verifies HMAC-SHA256 signature strictly using process.env.RAZORPAY_KEY_SECRET.
 * 2. Uses timingSafeEqual to prevent timing attacks.
 * 3. NEVER trusts client claims of payment success.
 * 4. Only after successful server-side verification is a booking considered PAID.
 * 5. Mints unique unpredictable ticket IDs (e.g. RL-XXXXXX) and verification tokens.
 * 6. Idempotent: Calling multiple times with the same payment ID returns the existing
 *    verified tickets without generating duplicates.
 * 7. QR code contains ONLY the secure verification URL/token (no sensitive card/user info).
 */

const crypto = require('crypto');

const PASS_PRICING = {
  stag: { name: 'Stag Pass', priceInr: 299, admit: 1 },
  couple: { name: 'Couple Pass', priceInr: 499, admit: 2 },
  group: { name: 'Group of 5', priceInr: 1199, admit: 5 }
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

// In-memory cache for warm container idempotency
const verifiedPaymentsCache = new Map();

/**
 * Generate an unpredictable, collision-resistant ticket ID derived cryptographically
 * from the payment ID and the server secret.
 * This guarantees complete idempotency across repeated verification calls.
 */
function generateDeterministicTicketId(paymentId, index, secret) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Non-confusing uppercase charset
  const hash = crypto.createHmac('sha256', secret).update(`${paymentId}:ticket_id:${index}`).digest('hex');
  let code = 'RL-';
  for (let i = 0; i < 6; i++) {
    const chunk = parseInt(hash.substring(i * 4, i * 4 + 4), 16);
    code += chars.charAt(chunk % chars.length);
  }
  return code;
}

/**
 * Generate a secure, unpredictable 32-character verification token for the QR code.
 */
function generateDeterministicToken(paymentId, index, secret) {
  const hash = crypto.createHmac('sha256', secret).update(`${paymentId}:token:${index}`).digest('hex');
  return 'rlv_' + hash.substring(0, 32);
}

function normalizeTier(tierStr) {
  if (!tierStr) return 'couple';
  const clean = String(tierStr).trim().toLowerCase();
  if (clean === 'stag' || clean.includes('stag')) return 'stag';
  if (clean === 'couple' || clean.includes('couple')) return 'couple';
  if (clean === 'group' || clean.includes('group') || clean.includes('5')) return 'group';
  return 'couple';
}

exports.handler = async function (event, context) {
  // Handle CORS preflight
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

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'RAZORPAY_KEY_SECRET_NOT_CONFIGURED',
        message: 'RAZORPAY_KEY_SECRET environment variable is missing in Netlify.'
      })
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'INVALID_JSON_BODY', message: 'Malformed JSON payload.' })
    };
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingDetails } = payload;

  // Validation: all 3 Razorpay verification parameters are required
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'MISSING_PAYMENT_PARAMETERS',
        message: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required for verification.'
      })
    };
  }

  // 1. CRYPTOGRAPHIC HMAC-SHA256 SIGNATURE VERIFICATION
  const bodyToSign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(bodyToSign)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(String(razorpay_signature).trim(), 'utf8');

  const isMatch = (expectedBuffer.length === receivedBuffer.length) &&
                  crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!isMatch) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Payment verification failed: Cryptographic signature mismatch. Pass has NOT been issued.'
      })
    };
  }

  // 2. IDEMPOTENCY CHECK (Requirement 24: Prevent duplicate ticket generation)
  if (verifiedPaymentsCache.has(razorpay_payment_id)) {
    const cached = verifiedPaymentsCache.get(razorpay_payment_id);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: 'PAYMENT_VERIFIED',
        alreadyVerified: true,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        paymentStatus: 'PAID',
        tickets: cached.tickets,
        orderSummary: cached.orderSummary
      })
    };
  }

  // 3. PARSE BOOKING METADATA
  const details = bookingDetails || {};
  const normalizedTier = normalizeTier(details.tier);
  const passInfo = PASS_PRICING[normalizedTier] || PASS_PRICING.couple;

  const rawQty = parseInt(details.qty, 10);
  const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.min(rawQty, 20) : 1;

  const customerName = String(details.customerName || 'Verified Attendee').trim().substring(0, 60);
  const customerPhone = String(details.customerPhone || '').trim().substring(0, 20);
  const customerEmail = String(details.customerEmail || '').trim().substring(0, 60);

  // 4. MINT UNIQUE UNPREDICTABLE TICKETS
  const mintedTickets = [];
  const timestamp = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  });

  for (let i = 0; i < qty; i++) {
    const ticketId = generateDeterministicTicketId(razorpay_payment_id, i, keySecret);
    const verifyToken = generateDeterministicToken(razorpay_payment_id, i, keySecret);

    const ticket = {
      event: 'RAAS LEELA 2026',
      id: ticketId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      name: customerName,
      phone: customerPhone,
      email: customerEmail,
      passType: passInfo.name,
      tier: normalizedTier,
      admitCount: passInfo.admit,
      amount: passInfo.priceInr,
      paymentStatus: 'PAID',
      status: 'ACTIVE',
      verifyToken: verifyToken,
      verifyUrl: '/verify/' + verifyToken,
      passNumber: (i + 1) + ' of ' + qty,
      verifiedAt: timestamp
    };
    mintedTickets.push(ticket);
  }

  const orderSummary = {
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    paymentStatus: 'PAID',
    tier: normalizedTier,
    passName: passInfo.name,
    qty: qty,
    admitPerPass: passInfo.admit,
    totalAdmit: passInfo.admit * qty,
    amountPerPass: passInfo.priceInr,
    totalAmountInr: passInfo.priceInr * qty,
    customerName: customerName,
    customerPhone: customerPhone,
    customerEmail: customerEmail,
    ticketCount: mintedTickets.length,
    verifiedAt: timestamp
  };

  // Cache verified order
  verifiedPaymentsCache.set(razorpay_payment_id, {
    tickets: mintedTickets,
    orderSummary: orderSummary
  });

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      success: true,
      message: 'PAYMENT_VERIFIED',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      paymentStatus: 'PAID',
      tickets: mintedTickets,
      orderSummary: orderSummary
    })
  };
};
