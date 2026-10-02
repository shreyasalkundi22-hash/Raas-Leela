/**
 * Netlify Serverless Function: create-order
 * 
 * Secure Server-Side Razorpay Order Creation for RAAS LEELA 2026.
 * 
 * Security & Design Rules:
 * 1. Uses process.env.RAZORPAY_KEY_ID & process.env.RAZORPAY_KEY_SECRET.
 * 2. Secrets are NEVER returned to the browser.
 * 3. Exact pricing is determined strictly server-side from PASS_PRICING.
 *    Client-supplied amounts are NEVER trusted.
 * 4. Passes:
 *    - Stag: ₹299 (29,900 paise, 1 person)
 *    - Couple: ₹499 (49,900 paise, 2 people)
 *    - Group of 5: ₹1,199 (1,19,900 paise, 5 people)
 * 5. Returns safe parameters for Razorpay Checkout: orderId, amount, currency, keyId.
 */

const https = require('https');

// Strict server-side pricing catalog (in paise)
const PASS_PRICING = {
  stag: { name: 'Stag Pass', pricePaise: 29900, priceInr: 299, admit: 1 },
  couple: { name: 'Couple Pass', pricePaise: 49900, priceInr: 499, admit: 2 },
  group: { name: 'Group of 5', pricePaise: 119900, priceInr: 1199, admit: 5 }
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

function normalizeTier(tierStr) {
  if (!tierStr) return null;
  const clean = String(tierStr).trim().toLowerCase();
  if (clean === 'stag' || clean.includes('stag')) return 'stag';
  if (clean === 'couple' || clean.includes('couple')) return 'couple';
  if (clean === 'group' || clean.includes('group') || clean.includes('5')) return 'group';
  return null;
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

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        configured: false,
        error: 'GATEWAY_CREDENTIALS_REQUIRED',
        message: 'Razorpay API credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured in Netlify environment variables.'
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

  const normalizedTier = normalizeTier(payload.tier);
  const passInfo = normalizedTier ? PASS_PRICING[normalizedTier] : null;

  if (!passInfo) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'INVALID_PASS_TIER',
        message: 'Invalid pass tier. Allowed options: stag (₹299), couple (₹499), group (₹1,199).'
      })
    };
  }

  // Validate and clamp quantity
  const rawQty = parseInt(payload.qty, 10);
  const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.min(rawQty, 20) : 1;

  // CRITICAL SECURITY: Price is calculated strictly on the server
  const totalAmountPaise = passInfo.pricePaise * qty;
  const totalAmountInr = passInfo.priceInr * qty;
  const totalAdmit = passInfo.admit * qty;

  const receiptId = 'rl_ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  const customerName = String(payload.customerName || 'Attendee').trim().substring(0, 60);
  const customerPhone = String(payload.customerPhone || '').trim().substring(0, 20);
  const customerEmail = String(payload.customerEmail || '').trim().substring(0, 60);

  const orderPayload = JSON.stringify({
    amount: totalAmountPaise,
    currency: 'INR',
    receipt: receiptId,
    notes: {
      event: 'RAAS LEELA 2026',
      passTier: normalizedTier,
      passName: passInfo.name,
      quantity: String(qty),
      admitCount: String(totalAdmit),
      amountInr: String(totalAmountInr),
      customerName: customerName,
      customerPhone: customerPhone,
      customerEmail: customerEmail
    }
  });

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.razorpay.com',
      path: '/v1/orders',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(orderPayload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const rzpRes = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve({
              statusCode: 200,
              headers: CORS_HEADERS,
              body: JSON.stringify({
                success: true,
                orderId: rzpRes.id,
                amount: rzpRes.amount,
                amountInr: totalAmountInr,
                currency: 'INR',
                keyId: keyId, // Safe public key ID returned to frontend for Checkout initialization
                tier: normalizedTier,
                passName: passInfo.name,
                qty: qty,
                admitCount: totalAdmit,
                receipt: receiptId
              })
            });
          } else {
            const errMsg = (rzpRes && rzpRes.error && rzpRes.error.description) || 'Failed to create order on Razorpay';
            resolve({
              statusCode: 502,
              headers: CORS_HEADERS,
              body: JSON.stringify({
                success: false,
                error: 'RAZORPAY_GATEWAY_ERROR',
                message: errMsg
              })
            });
          }
        } catch (err) {
          resolve({
            statusCode: 502,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              success: false,
              error: 'PARSE_ERROR',
              message: 'Failed to parse payment gateway response.'
            })
          });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'NETWORK_ERROR',
          message: 'Unable to connect to Razorpay payment gateway.'
        })
      });
    });

    req.setTimeout(12000, () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'GATEWAY_TIMEOUT',
          message: 'Razorpay order creation timed out.'
        })
      });
    });

    req.write(orderPayload);
    req.end();
  });
};
