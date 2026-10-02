/**
 * Netlify Function: admin-bookings
 * 
 * Secure Admin Endpoint: Fetches live pending payment verification requests,
 * overall booking records, audit logs, and accurate verified revenue calculations.
 * Protected by admin session token.
 */

const { verifyAdminSession } = require('./admin-guard');
const { rpc, fromTable, getSupabaseConfig } = require('./supabase-client');

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

  try {
    // 2. Fetch stats via hardened database procedure
    let stats = {};
    try {
      stats = await rpc('get_admin_dashboard_stats');
    } catch (sErr) {
      console.warn('Stats RPC error:', sErr.message);
    }

    // 3. Fetch Pending Payment Verifications
    const pendingBookings = await fromTable(
      'bookings',
      'payment_status=eq.PENDING_VERIFICATION&order=payment_submitted_at.desc&limit=50'
    );

    // 4. Fetch All Bookings (recent 100)
    const allBookings = await fromTable(
      'bookings',
      'order=created_at.desc&limit=100'
    );

    // 5. Fetch Recent Audit Logs
    let auditLogs = [];
    try {
      auditLogs = await fromTable('audit_logs', 'order=created_at.desc&limit=30');
    } catch (aErr) {}

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        stats: stats || {},
        pendingBookings: pendingBookings || [],
        allBookings: allBookings || [],
        auditLogs: auditLogs || []
      })
    };

  } catch (err) {
    console.error('[admin-bookings] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Could not fetch admin data: ' + err.message
      })
    };
  }
};
