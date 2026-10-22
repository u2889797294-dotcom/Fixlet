// POST /api/cancel-premium  { username, code }
// Free self-service cancellation of Premium. The sign-in pair (username + 6-digit number) is checked against the
// users row first. The subscription is set to end at the end of the week that is already paid for.
const { sbGetRow, cancelPremiumFor } = require('./_shared');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not configured yet.' });
    const { username, code } = req.body || {};
    if(typeof username !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Missing sign-in details.' });
    const key = username.trim().toLowerCase();
    const users = (await sbGetRow('users')) || [];
    const account = Array.isArray(users) ? users.find(a => a && a.username && String(a.username).toLowerCase() === key) : null;
    if(!account || String(account.code) !== code) return res.status(403).json({ error: 'Sign-in details did not match.' });
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
