// Shared helpers for the Stripe API routes. Files starting with "_" are NOT public routes on Vercel.
// SECRETS live only in Vercel environment variables — never in index.html.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upqntfrjjkmlrguhwgut.supabase.co';
const TABLE = 'Jelp-services';

function serviceKey(){ return process.env.SUPABASE_SERVICE_KEY || ''; }

async function sbGetRow(id, key){
  const k = key || serviceKey();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=data`, {
    headers: { apikey: k, Authorization: `Bearer ${k}` }
  });
  if(!r.ok) throw new Error('Supabase read failed: HTTP ' + r.status);
  const rows = await r.json();
  return rows && rows[0] ? rows[0].data : null;
}
async function sbPutRow(id, data){
  const k = serviceKey();
  if(!k) throw new Error('SUPABASE_SERVICE_KEY is not set');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id, data })
  });
  if(!r.ok) throw new Error('Supabase write failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function stripe(path, { method = 'GET', form } = {}){
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  const json = await r.json();
  if(!r.ok) throw new Error('Stripe: ' + (json && json.error && json.error.message || r.status));
  return json;
}
const DAY = 24 * 3600 * 1000;
async function setPremium(username, until, extra){
  const row = (await sbGetRow('premium')) || {};
  if(until) row[username] = Object.assign({}, row[username], { until }, extra || {}); else delete row[username];
  await sbPutRow('premium', row);
}
// Ends a user's Premium subscription at the end of the week that is already paid for (no refund, no further charges).
async function cancelPremiumFor(username){
  const row = (await sbGetRow('premium')) || {};
  let subId = row[username] && row[username].sub;
  if(!subId){
    const found = await stripe('subscriptions/search?query=' + encodeURIComponent("metadata['username']:'" + username + "' AND status:'active'"));
    subId = found && found.data && found.data[0] && found.data[0].id;
  }
  if(!subId) throw new Error('No active subscription found for ' + username);
  const sub = await stripe('subscriptions/' + subId, { method: 'POST', form: { cancel_at_period_end: 'true' } });
  const until = sub.current_period_end * 1000 + DAY;
  await setPremium(username, until, { sub: subId, cancelling: true });
  return until;
}

// Simple rate limiter kept in one Supabase row ("ratelimit"). Keys are hashed so no raw IP address or username is stored.
// Returns { ok, retryAfterSec }. Reads are best-effort: if the store is unavailable the request is allowed.
const crypto = require('crypto');
async function rateLimit(rawKey, max, windowMs){
  try{
    const key = crypto.createHash('sha256').update(String(rawKey)).digest('hex').slice(0, 24);
    const now = Date.now();
    const row = (await sbGetRow('ratelimit')) || {};
    // drop old entries everywhere so the row stays small
    for(const k of Object.keys(row)){ row[k] = (row[k] || []).filter(t => now - t < 24 * 3600 * 1000); if(!row[k].length) delete row[k]; }
    const hits = (row[key] || []).filter(t => now - t < windowMs);
    if(hits.length >= max) return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - hits[0])) / 1000) };
    hits.push(now); row[key] = hits;
    await sbPutRow('ratelimit', row);
    return { ok: true };
  }catch(e){ console.error('rateLimit unavailable', e && e.message); return { ok: true }; }
}
function clientIp(req){
  const f = req.headers && req.headers['x-forwarded-for'];
  return (f ? String(f).split(',')[0].trim() : (req.socket && req.socket.remoteAddress)) || 'unknown';
}

async function sbDeleteRow(id){
  const k = serviceKey();
  if(!k) throw new Error('SUPABASE_SERVICE_KEY is not set');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { apikey: k, Authorization: `Bearer ${k}` } });
  if(!r.ok) throw new Error('Supabase delete failed: HTTP ' + r.status);
}
async function sbGetRows(ids){
  const k = serviceKey();
  if(!ids.length) return {};
  const list = ids.map(i => '"' + String(i).replace(/"/g, '') + '"').join(',');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=in.(${encodeURIComponent(list)})&select=id,data`, { headers: { apikey: k, Authorization: `Bearer ${k}` } });
  if(!r.ok) throw new Error('Supabase read failed: HTTP ' + r.status);
  const out = {}; (await r.json()).forEach(x => { out[x.id] = x.data; });
  return out;
}

// ---------- passwords and sessions (no external packages) ----------
// Passwords are stored only as salted scrypt hashes. A session is a signed token: base64url(json) + "." + HMAC.
const SESSION_DAYS = 30;
function secret(){ return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || ''; }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function hashPassword(pw){
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) => e ? reject(e) : resolve('s1$' + salt.toString('hex') + '$' + key.toString('hex')));
  });
}
function verifyPassword(pw, stored){
  return new Promise((resolve) => {
    const parts = String(stored || '').split('$');
    if(parts.length !== 3 || parts[0] !== 's1') return resolve(false);
    crypto.scrypt(pw, Buffer.from(parts[1], 'hex'), 64, { N: 16384, r: 8, p: 1 }, (e, key) => {
      if(e) return resolve(false);
      const want = Buffer.from(parts[2], 'hex');
      resolve(key.length === want.length && crypto.timingSafeEqual(key, want));
    });
  });
}
function signToken(username){
  const body = b64u(JSON.stringify({ u: String(username).toLowerCase(), n: username, iat: Date.now(), exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000 }));
  const sig = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
  return body + '.' + sig;
}
// Returns { username, key, iat } for a valid, un-expired, un-banned, un-kicked session, otherwise null.
async function readSession(req){
  try{
    const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    const [body, sig] = tok.split('.');
    if(!body || !sig || !secret()) return null;
    const want = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
    if(sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const d = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if(!d.u || d.exp < Date.now()) return null;
    const extra = await sbGetRows(['banned', 'forceLogout', 'accounts']);
    // The account must still exist, and must be older than the token (a deleted and later re-registered name never inherits old tokens).
    const acct = extra.accounts && extra.accounts[d.u];
    if(!acct || acct.created > d.iat) return null;
    const banned = Array.isArray(extra.banned) ? extra.banned.map(x => String(x).toLowerCase()) : [];
    if(banned.includes(d.u)) return null;
    const kicks = extra.forceLogout && typeof extra.forceLogout === 'object' ? extra.forceLogout : {};
    const kickedAt = Math.max(kicks[d.u] || 0, kicks[d.n] || 0);
    if(kickedAt && kickedAt > d.iat) return null;
    return { username: d.n, key: d.u, iat: d.iat };
  }catch(e){ return null; }
}
// Counts only failures: rateBlocked() asks "is this key over the limit?", rateRecord() notes one more failure.
async function rateBlocked(rawKey, max, windowMs){
  try{
    const key = crypto.createHash('sha256').update(String(rawKey)).digest('hex').slice(0, 24);
    const row = (await sbGetRow('ratelimit')) || {};
    const hits = (row[key] || []).filter(t => Date.now() - t < windowMs);
    return hits.length >= max ? Math.ceil((windowMs - (Date.now() - hits[0])) / 1000) : 0;
  }catch(e){ return 0; }
}
async function rateRecord(rawKey){
  try{
    const key = crypto.createHash('sha256').update(String(rawKey)).digest('hex').slice(0, 24);
    const now = Date.now();
    const row = (await sbGetRow('ratelimit')) || {};
    for(const k of Object.keys(row)){ row[k] = (row[k] || []).filter(t => now - t < 24 * 3600 * 1000); if(!row[k].length) delete row[k]; }
    row[key] = (row[key] || []).concat(now);
    await sbPutRow('ratelimit', row);
  }catch(e){}
}
module.exports = { sbGetRow, sbGetRows, sbPutRow, sbDeleteRow, stripe, serviceKey, setPremium, cancelPremiumFor, rateLimit, rateBlocked, rateRecord, clientIp, hashPassword, verifyPassword, signToken, readSession, DAY };
