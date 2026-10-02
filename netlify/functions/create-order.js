/**
 * Netlify Serverless Function: create-order
 * 
 * Secure Server-Side Razorpay Order Creation for RAAS LEELA 2026.
 * 
 * Security & Design Rules:
 * 1. Reads credentials strictly server-side using process.env.RAZORPAY_KEY_ID & process.env.RAZORPAY_KEY_SECRET.
 * 2. RAZORPAY_KEY_SECRET is NEVER exposed or returned to the browser.
 * 3. Exact pricing is determined strictly server-side from PASS_PRICING (client amounts are never trusted).
 * 4. Pass tiers:
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

function cleanEnvValue(val) {
  if (!val) return '';
  let str = String(val).trim();
  // Strip accidental wrapping quotes (single or double) from copy-paste in UI
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

/**
 * Robust server-side environment variable resolver:
 * Checks direct name, alias names, and case-insensitive names across process.env.
 */
function getEnvVar(targetNames) {
  // 1. Direct check
  for (const name of targetNames) {
    if (process.env[name] && String(process.env[name]).trim() !== '') {
      return cleanEnvValue(process.env[name]);
    }
  }

  // 2. Case-insensitive and trimmed key name check across all process.env keys
  const normalizedTargets = targetNames.map(n => n.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  for (const [key, val] of Object.entries(process.env || {})) {
    const cleanKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalizedTargets.includes(cleanKey)) {
      if (val && String(val).trim() !== '') {
        return cleanEnvValue(val);
      }
    }
  }

  return '';
}

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

  // Parse body safely (supports raw JSON string or base64 encoded body)
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

  // 1. RESOLVE CREDENTIALS SERVER-SIDE
  // Read process.env.RAZORPAY_KEY_ID & process.env.RAZORPAY_KEY_SECRET with robust aliases
  const keyId = getEnvVar([
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY',
    'RZP_KEY_ID',
    'RZP_TEST_KEY_ID',
    'RAZORPAY_KEY_ID_TEST'
  ]) || cleanEnvValue(payload.keyId);

  const keySecret = getEnvVar([
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_SECRET',
    'RZP_KEY_SECRET',
    'RZP_TEST_KEY_SECRET',
    'RAZORPAY_SECRET_TEST'
  ]);

  // Diagnostic logging to Netlify function logs (safe, zero secrets leaked)
  console.log('[create-order] Environment check:', {
    hasKeyId: Boolean(keyId),
    keyIdPrefix: keyId ? keyId.substring(0, 8) + '...' : 'none',
    hasKeySecret: Boolean(keySecret),
    availableRazorpayEnvKeys: Object.keys(process.env || {}).filter(k => /razor|rzp/i.test(k))
  });

  if (!keyId || !keySecret) {
    const missing = [];
    if (!keyId) missing.push('RAZORPAY_KEY_ID');
    if (!keySecret) missing.push('RAZORPAY_KEY_SECRET');

    return {
      statusCode: 503,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        configured: false,
        error: 'GATEWAY_CREDENTIALS_REQUIRED',
        missing: missing,
        message: `Razorpay credentials missing in Netlify Functions: ${missing.join(', ')}. In Netlify Site configuration > Environment variables, ensure both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET have Scope set to 'Functions' (or 'All').`
      })
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

  const receiptId = 'rl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

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
            console.error('[create-order] Razorpay API Error:', res.statusCode, errMsg);
            resolve({
              statusCode: 502,
              headers: CORS_HEADERS,
              body: JSON.stringify({
                success: false,
                error: 'RAZORPAY_GATEWAY_ERROR',
                statusCode: res.statusCode,
                message: errMsg
              })
            });
          }
        } catch (err) {
          console.error('[create-order] JSON parse error from Razorpay:', err);
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
      console.error('[create-order] HTTPS request error:', err);
      resolve({
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: false,
          error: 'NETWORK_ERROR',
          message: 'Unable to connect to Razorpay payment gateway: ' + err.message
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
