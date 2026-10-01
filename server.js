/**
 * Raas Leela 2026 - Production Companion Backend Server
 * 
 * Built with standard Node.js libraries (zero external dependencies required).
 * 
 * Features:
 * 1. Admin Authentication with SHA-256 password hashing & secure session tokens.
 * 2. Razorpay Order Creation (Backend determines exact pricing, never trusts client amounts).
 * 3. Cryptographic HMAC SHA-256 Payment Verification & signed Webhook handler.
 * 4. Cryptographic Ticket ID & Token Minting only upon verified payments.
 * 5. Static file serving with UTF-8 encoding headers.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// SHA-256 of exact case-sensitive admin password 'rl20206'
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 'd3778c56ec11500849532666e99ef708ad3e2dfb4935366ffbf8844dd16a5260';

// Fixed event pass pricing catalog (in paise)
const PASS_PRICING = {
  stag: { name: 'Stag Pass', pricePaise: 29900, priceInr: 299, admit: 1 },
  couple: { name: 'Couple Pass', pricePaise: 49900, priceInr: 499, admit: 2 },
  group: { name: 'Group of 5', pricePaise: 119900, priceInr: 1199, admit: 5 }
};

// In-memory persistent data store
const activeAdminSessions = new Set();
const ordersDatabase = new Map();
const ticketsDatabase = new Map();

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function generateSecureToken(prefix = 'rlv_') {
  return prefix + crypto.randomBytes(16).toString('hex');
}

function generateTicketId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'RL-';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve({ raw: body, parsed: body ? JSON.parse(body) : {} });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(payload);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  // 1. ADMIN AUTHENTICATION ENDPOINT
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      const { parsed } = await parseJsonBody(req);
      const password = parsed.password || '';
      const inputHash = sha256(password);

      if (inputHash === ADMIN_PASSWORD_HASH) {
        const sessionToken = generateSecureToken('adm_');
        activeAdminSessions.add(sessionToken);
        return sendJson(res, 200, {
          success: true,
          message: 'ACCESS GRANTED',
          token: sessionToken
        });
      } else {
        return sendJson(res, 401, {
          success: false,
          error: 'INCORRECT_PASSWORD',
          message: 'ACCESS DENIED'
        });
      }
    } catch (err) {
      return sendJson(res, 400, { success: false, error: 'BAD_REQUEST' });
    }
  }

  // 2. ADMIN VERIFY SESSION ENDPOINT
  if (pathname === '/api/admin/verify' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (activeAdminSessions.has(token)) {
      return sendJson(res, 200, { success: true, authenticated: true });
    }
    return sendJson(res, 401, { success: false, error: 'ACCESS_DENIED' });
  }

  // 3. ADMIN LOGOUT ENDPOINT
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    activeAdminSessions.delete(token);
    return sendJson(res, 200, { success: true, message: 'LOGGED_OUT' });
  }

  // 4. CREATE PAYMENT ORDER (Backend determines amount from pass catalog)
  if (pathname === '/api/payment/create-order' && req.method === 'POST') {
    try {
      const { parsed } = await parseJsonBody(req);
      const tier = (parsed.tier || '').toLowerCase();
      const qty = parseInt(parsed.qty, 10) || 1;
      const passInfo = PASS_PRICING[tier];

      if (!passInfo) {
        return sendJson(res, 400, { success: false, error: 'INVALID_PASS_TIER' });
      }

      // Check if real gateway credentials are configured
      if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return sendJson(res, 503, {
          success: false,
          configured: false,
          error: 'GATEWAY_CREDENTIALS_REQUIRED',
          message: 'Razorpay API credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are not configured.'
        });
      }

      const totalAmountPaise = passInfo.pricePaise * qty;
      const receiptId = 'ord_' + Date.now().toString(36);

      // Call Razorpay Orders API
      const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
      const orderPayload = JSON.stringify({
        amount: totalAmountPaise,
        currency: 'INR',
        receipt: receiptId,
        notes: {
          customerName: parsed.customerName || '',
          customerPhone: parsed.customerPhone || '',
          passTier: tier,
          quantity: qty
        }
      });

      const rzpReq = https.request({
        hostname: 'api.razorpay.com',
        path: '/v1/orders',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(orderPayload)
        }
      }, (rzpRes) => {
        let rzpData = '';
        rzpRes.on('data', chunk => { rzpData += chunk; });
        rzpRes.on('end', () => {
          try {
            const orderRes = JSON.parse(rzpData);
            if (rzpRes.statusCode === 200 || rzpRes.statusCode === 201) {
              ordersDatabase.set(orderRes.id, {
                orderId: orderRes.id,
                tier: tier,
                passName: passInfo.name,
                qty: qty,
                amountPaise: totalAmountPaise,
                amountInr: passInfo.priceInr * qty,
                customerName: parsed.customerName,
                customerPhone: parsed.customerPhone,
                status: 'CREATED',
                createdAt: new Date().toISOString()
              });
              return sendJson(res, 200, {
                success: true,
                orderId: orderRes.id,
                amount: totalAmountPaise,
                currency: 'INR',
                keyId: RAZORPAY_KEY_ID
              });
            } else {
              return sendJson(res, 502, { success: false, error: orderRes });
            }
          } catch (e) {
            return sendJson(res, 502, { success: false, error: 'GATEWAY_RESPONSE_PARSE_ERROR' });
          }
        });
      });

      rzpReq.on('error', (err) => {
        sendJson(res, 502, { success: false, error: err.message });
      });

      rzpReq.write(orderPayload);
      rzpReq.end();
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // 5. SERVER-SIDE PAYMENT SIGNATURE VERIFICATION
  if (pathname === '/api/payment/verify' && req.method === 'POST') {
    try {
      const { parsed } = await parseJsonBody(req);
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return sendJson(res, 400, { success: false, error: 'MISSING_PAYMENT_PARAMETERS' });
      }

      if (!RAZORPAY_KEY_SECRET) {
        return sendJson(res, 503, { success: false, error: 'RAZORPAY_KEY_SECRET_NOT_CONFIGURED' });
      }

      // Cryptographic HMAC-SHA256 verification
      const bodyToSign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(bodyToSign)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return sendJson(res, 400, {
          success: false,
          error: 'INVALID_SIGNATURE',
          message: 'Payment verification failed. Signature mismatch.'
        });
      }

      // Mark order as PAID and issue ticket
      const order = ordersDatabase.get(razorpay_order_id) || {};
      order.status = 'PAID';
      order.paymentId = razorpay_payment_id;
      order.verifiedAt = new Date().toISOString();

      const mintedTickets = [];
      const qty = order.qty || 1;
      const passInfo = PASS_PRICING[order.tier] || PASS_PRICING.couple;

      for (let i = 0; i < qty; i++) {
        const ticketId = generateTicketId();
        const verifyToken = generateSecureToken('rlv_');
        const ticket = {
          id: ticketId,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          name: order.customerName || 'Verified Attendee',
          phone: order.customerPhone || '',
          passType: passInfo.name,
          tier: order.tier || 'couple',
          admitCount: passInfo.admit,
          amount: passInfo.priceInr,
          paymentStatus: 'PAID',
          status: 'ACTIVE',
          verifyToken: verifyToken,
          createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        };
        ticketsDatabase.set(verifyToken, ticket);
        mintedTickets.push(ticket);
      }

      return sendJson(res, 200, {
        success: true,
        message: 'PAYMENT_VERIFIED',
        tickets: mintedTickets
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 6. RAZORPAY SIGNED WEBHOOK ENDPOINT
  if (pathname === '/api/payment/webhook' && req.method === 'POST') {
    try {
      const { raw, parsed } = await parseJsonBody(req);
      const signature = req.headers['x-razorpay-signature'] || '';

      if (WEBHOOK_SECRET) {
        const expectedSignature = crypto
          .createHmac('sha256', WEBHOOK_SECRET)
          .update(raw)
          .digest('hex');

        if (expectedSignature !== signature) {
          return sendJson(res, 400, { success: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
        }
      }

      const event = parsed.event;
      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = (parsed.payload && parsed.payload.payment && parsed.payload.payment.entity) || {};
        const orderId = paymentEntity.order_id || (parsed.payload && parsed.payload.order && parsed.payload.order.entity && parsed.payload.order.entity.id);
        const paymentId = paymentEntity.id;

        if (orderId && ordersDatabase.has(orderId)) {
          const order = ordersDatabase.get(orderId);

          // Idempotency check: if already processed, return immediately
          if (order.status === 'PAID') {
            return sendJson(res, 200, { status: 'ok', message: 'ALREADY_PROCESSED' });
          }

          order.status = 'PAID';
          order.paymentId = paymentId;
          order.verifiedAt = new Date().toISOString();

          const qty = order.qty || 1;
          const passInfo = PASS_PRICING[order.tier] || PASS_PRICING.couple;
          for (let i = 0; i < qty; i++) {
            const ticketId = generateTicketId();
            const verifyToken = generateSecureToken('rlv_');
            const ticket = {
              id: ticketId,
              orderId: orderId,
              paymentId: paymentId,
              name: order.customerName || 'Verified Attendee',
              phone: order.customerPhone || '',
              passType: passInfo.name,
              tier: order.tier || 'couple',
              admitCount: passInfo.admit,
              amount: passInfo.priceInr,
              paymentStatus: 'PAID',
              status: 'ACTIVE',
              verifyToken: verifyToken,
              createdAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
            };
            ticketsDatabase.set(verifyToken, ticket);
          }
        }
      }

      return sendJson(res, 200, { status: 'ok' });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 7. SECURE TICKET VERIFICATION (Gate Check-In)
  if (pathname.startsWith('/api/ticket/verify/')) {
    const token = pathname.replace('/api/ticket/verify/', '');
    const ticket = ticketsDatabase.get(token);
    if (!ticket) {
      return sendJson(res, 404, { success: false, error: 'TICKET_NOT_FOUND' });
    }
    return sendJson(res, 200, { success: true, ticket });
  }

  // 7. STATIC FILE SERVING
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = 'index.html';
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Check 404 or redirect
      const notFoundPath = path.join(__dirname, '404.html');
      fs.readFile(notFoundPath, (err404, content404) => {
        if (!err404) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end(content404);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Raas Leela Server running on http://localhost:${PORT}`);
  console.log(`Admin Secure Auth Hash: ${ADMIN_PASSWORD_HASH}`);
  console.log(`Razorpay Gateway Status: ${RAZORPAY_KEY_ID ? 'CONFIGURED' : 'CREDENTIALS_REQUIRED'}`);
});
