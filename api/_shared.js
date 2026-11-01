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
module.exports = { sbGetRow, sbPutRow, stripe, serviceKey, setPremium, cancelPremiumFor, rateLimit, clientIp, DAY };
