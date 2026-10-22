// POST /api/stripe-webhook  — called by Stripe, NOT by the website.
// Verifies Stripe's signature, then records paid boosts in two Supabase rows:
//   "boosts"  : { "<serviceId>": { until, plan, session } }
//   "premium" : { "<username>":  { until } }
// They are separate rows on purpose so the website's own saves can never overwrite them.
const crypto = require('crypto');
const { sbGetRow, sbPutRow, stripe } = require('./_shared');

const DAY = 24 * 3600 * 1000;

function readRaw(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function verify(raw, header, secret){
  if(!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t = parts.t, sig = parts.v1;
  if(!t || !sig) return false;
  if(Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5 min tolerance
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + raw.toString('utf8')).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function setPremium(username, until, extra){
  const row = (await sbGetRow('premium')) || {};
  if(until) row[username] = Object.assign({}, row[username], { until }, extra || {}); else delete row[username];
  await sbPutRow('premium', row);
}
// Ends a user's Premium subscription at the end of the week that is already paid for.
async function cancelPremiumFor(username){
  const row = (await sbGetRow('premium')) || {};
  let subId = row[username] && row[username].sub;
  if(!subId){
    const found = await stripe('subscriptions/search?query=' + encodeURIComponent("metadata['username']:'" + username + "' AND status:'active'"));
    subId = found && found.data && found.data[0] && found.data[0].id;
  }
  if(!subId) throw new Error('No active subscription found for ' + username);
  const sub = await stripe('subscriptions/' + subId, { method: 'POST', form: { cancel_at_period_end: 'true' } });
  await setPremium(username, sub.current_period_end * 1000 + DAY, { sub: subId, cancelling: true });
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).end();
  const raw = await readRaw(req);
  if(!verify(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return res.status(400).send('Bad signature');
  const event = JSON.parse(raw.toString('utf8'));
  try {
    const obj = event.data.object;
    if(event.type === 'checkout.session.completed' && obj.payment_status !== 'unpaid'){
      const m = obj.metadata || {};
      if(m.plan === 'boost50' || m.plan === 'boost100'){
        const boosts = (await sbGetRow('boosts')) || {};
        if(!boosts[m.serviceId] || boosts[m.serviceId].session !== obj.id){ // idempotent on Stripe retries
          boosts[m.serviceId] = { until: Date.now() + 30 * DAY, plan: m.plan, pct: m.plan === 'boost100' ? 100 : 50, session: obj.id };
          await sbPutRow('boosts', boosts);
        }
      } else if(m.plan === 'premium'){
        await setPremium(m.username, Date.now() + 8 * DAY, { sub: obj.subscription, cancelling: false }); // renewed by invoice.paid each week
      } else if(m.plan === 'cancelpremium'){
        await cancelPremiumFor(m.username);
      }
    } else if(event.type === 'invoice.paid' && obj.subscription){
      const sub = await stripe('subscriptions/' + obj.subscription);
      const u = sub.metadata && sub.metadata.username;
      if(u) await setPremium(u, sub.current_period_end * 1000 + DAY);
    } else if(event.type === 'customer.subscription.deleted'){
      const u = obj.metadata && obj.metadata.username;
      if(u) await setPremium(u, null);
    }
    return res.status(200).json({ received: true });
  } catch(e){
    console.error('webhook error', e);
    return res.status(500).send('Handler error'); // Stripe will retry
  }
};
module.exports.config = { api: { bodyParser: false } };
