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
module.exports = { sbGetRow, sbPutRow, stripe, serviceKey };
