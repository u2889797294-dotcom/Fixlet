// POST /api/verify-payment  { sessionId }   Authorization: Bearer <session token>
// Called by the website when you come back from Stripe. It asks Stripe directly whether the session is paid and, if so,
// activates the Boost / Premium right away. This means a purchase works even if the Stripe webhook is late or not set up.
const { stripe, readSession, rateLimit, clientIp, activateCheckout } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try{
    if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not configured yet.' });
    const sess = await readSession(req);
    if(!sess) return res.status(401).json({ error: 'not_signed_in' });
    const lim = await rateLimit('verify-ip:' + clientIp(req), 60, 3600 * 1000);
    if(!lim.ok) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const id = String((req.body || {}).sessionId || '');
    if(!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) return res.status(400).json({ error: 'bad_session' });
    const obj = await stripe('checkout/sessions/' + id);
    const m = obj.metadata || {};
    if(String(m.username || '').toLowerCase() !== String(sess.username).toLowerCase()) return res.status(403).json({ error: 'not_your_payment' });
    const r = await activateCheckout(obj);
    return res.status(200).json({ ok: true, activated: !!r.activated, reason: r.reason || null, plan: m.plan || null });
  }catch(e){
    console.error('verify-payment error', e);
    return res.status(500).json({ error: 'Could not check the payment.' });
  }
};
