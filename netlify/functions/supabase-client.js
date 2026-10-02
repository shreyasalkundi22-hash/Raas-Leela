/**
 * Server-Side Supabase Client for Raas Leela Netlify Functions
 * 
 * SECURITY RULES:
 * 1. Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY strictly server-side.
 * 2. Zero npm dependencies (uses standard Node.js https / fetch).
 * 3. Never returns or exposes the service_role key to clients.
 * 4. Automatically strips wrapping quotes or whitespace from environment variables.
 */

const https = require('https');
const url = require('url');

function cleanEnv(val) {
  if (!val) return '';
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

function getEnvVar(names) {
  for (const n of names) {
    if (process.env[n] && String(process.env[n]).trim() !== '') {
      return cleanEnv(process.env[n]);
    }
  }
  const cleanTargets = names.map(n => n.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  for (const [k, v] of Object.entries(process.env || {})) {
    const ck = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanTargets.includes(ck) && v && String(v).trim() !== '') {
      return cleanEnv(v);
    }
  }
  return '';
}

const SUPABASE_URL = getEnvVar([
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_API_URL'
]);

const SUPABASE_SERVICE_ROLE_KEY = getEnvVar([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_KEY',
  'SERVICE_ROLE_KEY'
]);

function getSupabaseConfig() {
  const sbUrl = getEnvVar(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_API_URL']) || SUPABASE_URL;
  const sbKey = getEnvVar(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY', 'SERVICE_ROLE_KEY']) || SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    const missing = [];
    if (!sbUrl) missing.push('SUPABASE_URL');
    if (!sbKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    return {
      configured: false,
      missing,
      error: `Missing Supabase credentials in Netlify Functions: ${missing.join(', ')}. Please configure them under Netlify Site configuration > Environment variables with scope set to Functions.`
    };
  }

  return {
    configured: true,
    url: sbUrl.replace(/\/+$/, ''),
    key: sbKey
  };
}

/**
 * Standard HTTP request helper for PostgREST & RPC calls
 */
function makeSupabaseRequest(endpointPath, method = 'GET', bodyData = null, customHeaders = {}) {
  const config = getSupabaseConfig();
  if (!config.configured) {
    return Promise.reject(new Error(config.error));
  }

  const fullUrl = config.url + endpointPath;
  const parsed = url.parse(fullUrl);

  const payload = bodyData ? JSON.stringify(bodyData) : null;

  const headers = Object.assign({
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json'
  }, customHeaders);

  if (payload) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.path,
      method: method,
      headers: headers
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let parsedData = null;
        if (rawData) {
          try {
            parsedData = JSON.parse(rawData);
          } catch (e) {
            parsedData = rawData;
          }
        }
        resolve({
          statusCode: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data: parsedData,
          headers: res.headers
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Call a Postgres Stored Procedure via Supabase RPC
 */
async function rpc(functionName, params = {}) {
  const res = await makeSupabaseRequest(`/rest/v1/rpc/${functionName}`, 'POST', params);
  if (!res.ok) {
    const errMsg = (res.data && (res.data.message || res.data.error || res.data.hint)) || `RPC ${functionName} failed with status ${res.statusCode}`;
    const err = new Error(errMsg);
    err.statusCode = res.statusCode;
    err.details = res.data;
    throw err;
  }
  return res.data;
}

/**
 * Query a PostgREST table
 */
async function fromTable(tableName, queryParams = '') {
  const p = `/rest/v1/${tableName}${queryParams ? (queryParams.startsWith('?') ? queryParams : '?' + queryParams) : ''}`;
  const res = await makeSupabaseRequest(p, 'GET');
  if (!res.ok) {
    const errMsg = (res.data && res.data.message) || `Query on ${tableName} failed with status ${res.statusCode}`;
    const err = new Error(errMsg);
    err.statusCode = res.statusCode;
    err.details = res.data;
    throw err;
  }
  return res.data;
}

/**
 * Insert rows into a PostgREST table
 */
async function insertIntoTable(tableName, data) {
  const p = `/rest/v1/${tableName}`;
  const res = await makeSupabaseRequest(p, 'POST', data, { 'Prefer': 'return=representation' });
  if (!res.ok) {
    const errMsg = (res.data && res.data.message) || `Insert on ${tableName} failed with status ${res.statusCode}`;
    const err = new Error(errMsg);
    err.statusCode = res.statusCode;
    err.details = res.data;
    throw err;
  }
  return res.data;
}

/**
 * Update rows in a PostgREST table
 */
async function updateTable(tableName, filterQuery, updateData) {
  const p = `/rest/v1/${tableName}?${filterQuery}`;
  const res = await makeSupabaseRequest(p, 'PATCH', updateData, { 'Prefer': 'return=representation' });
  if (!res.ok) {
    const errMsg = (res.data && res.data.message) || `Update on ${tableName} failed with status ${res.statusCode}`;
    const err = new Error(errMsg);
    err.statusCode = res.statusCode;
    err.details = res.data;
    throw err;
  }
  return res.data;
}

module.exports = {
  getSupabaseConfig,
  rpc,
  fromTable,
  insertIntoTable,
  updateTable
};
