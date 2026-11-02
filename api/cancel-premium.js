// POST /api/cancel-premium  { username, code }
// Free self-service cancellation of Premium. The sign-in pair (username + 6-digit number) is checked against the
// users row first. The subscription is set to end at the end of the week that is already paid for.
const { sbGetRow, cancelPremiumFor, rateLimit, clientIp, readSession } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not configured yet.' });
    let { username, code } = req.body || {};
    const sess = await readSession(req); // new login: the signed-in session is the proof, no number needed
    if(sess){ username = sess.username; code = null; }
    else if(typeof username !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Missing sign-in details.' });
    const key = username.trim().toLowerCase();
    // Every attempt counts: max 5 per hour per username and 20 per hour per IP address (stops guessing of the 6-digit number).
    const a = await rateLimit('cancel-user:' + key, 5, 3600 * 1000);
    const b = await rateLimit('cancel-ip:' + clientIp(req), 20, 3600 * 1000);
    if(!a.ok || !b.ok){
      const wait = Math.max(a.retryAfterSec || 0, b.retryAfterSec || 0);
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many attempts. Try again in ' + Math.ceil(wait / 60) + ' minutes.' });
    }
    if(!sess){
      const users = (await sbGetRow('users')) || [];
      const account = Array.isArray(users) ? users.find(a => a && a.username && String(a.username).toLowerCase() === key) : null;
      if(!account || String(account.code) !== code) return res.status(403).json({ error: 'Sign-in details did not match.' });
    }
    const prem = (await sbGetRow('premium')) || {};
    const me = prem[key];
    if(!me || !(me.until > Date.now())) return res.status(400).json({ error: 'There is no active Premium on this account.' });
    if(me.cancelling) return res.status(200).json({ ok: true, until: me.until, already: true });
    const until = await cancelPremiumFor(key);
    return res.status(200).json({ ok: true, until });
  } catch(e){
    console.error('cancel-premium error', e);
    return res.status(500).json({ error: 'Could not cancel Premium right now. Please try again or contact us.' });
  }
};
