// POST /api/admin  Authorization: Bearer <ADMIN_KEY>   { action, ... }
// Used only by admin.html. Everything runs here with the service key; the browser never touches the database.
const crypto = require('crypto');
const S = require('./_shared');

function fail(res, code, error){ return res.status(code).json({ error }); }
function chatRowId(serviceId){ return 'chat_' + String(serviceId).replace(/[^A-Za-z0-9]/g, '_'); }
function keyOf(v){ return typeof v === 'string' ? v.trim().toLowerCase().slice(0, 20) : ''; }
function sameKey(a, b){
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function removeListings(svcs, shouldDelete){
  const gone = svcs.filter(shouldDelete);
  for(const x of gone) await S.sbDeleteRow(chatRowId(x.id)).catch(() => {});
  await S.sbPutRow('svc2', svcs.filter(x => !shouldDelete(x)));
  return gone.length;
}

async function removeAccount(key, withListings, accounts){
  const note = [];
  const prem = (await S.sbGetRow('premium')) || {};
  const pr = prem[key];
  if(pr && pr.until > Date.now() && !pr.cancelling && process.env.STRIPE_SECRET_KEY){
    try{ await S.cancelPremiumFor(key); }catch(e){ note.push('premium_not_cancelled'); }
  }
  if(withListings){
    const svcs = (await S.sbGetRow('svc2')) || [];
    await removeListings(svcs, x => x && String(x.ownerCode).toLowerCase() === key);
  }
  const acc = accounts[key];
  const idx = (await S.sbGetRow('chatidx')) || {};
  for(const sid of (idx[key] || [])){
    const row = await S.sbGetRow(chatRowId(sid));
    if(row && acc && row[acc.username]){ delete row[acc.username]; await S.sbPutRow(chatRowId(sid), row); }
  }
  delete idx[key]; await S.sbPutRow('chatidx', idx);
  delete accounts[key];
  await S.sbDeleteRow('av_' + key).catch(() => {});
  await S.sbDeleteRow('an_' + key).catch(() => {});
  return note;
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return fail(res, 405, 'method');
  const ip = S.clientIp(req);
  const adminKey = process.env.ADMIN_KEY || '';
  try{
    const wait = await S.rateBlocked('admin:' + ip, 10, 3600 * 1000);
    if(wait) return fail(res, 429, 'rate_limited');
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if(!adminKey || !sameKey(given, adminKey)){ await S.rateRecord('admin:' + ip); return fail(res, 403, 'forbidden'); }

    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const accounts = (await S.sbGetRow('accounts')) || {};

    if(b.action === 'overview'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const counts = {};
      const ids = svcs.map(x => chatRowId(x.id));
      for(let i = 0; i < ids.length; i += 40){
        const rows = await S.sbGetRows(ids.slice(i, i + 40));
        Object.keys(rows || {}).forEach(id => {
          counts[id] = Object.values(rows[id] || {}).reduce((n, m) => n + (Array.isArray(m) ? m.length : 0), 0);
        });
      }
      const listings = svcs.map(x => ({
        id: x.id, name: x.name, cat: x.cat, country: x.country, cities: x.cities, price: x.price, currency: x.currency,
        createdAt: x.createdAt, ownerCode: x.ownerCode, messages: counts[chatRowId(x.id)] || 0
      }));
      const users = Object.values(accounts).map(a => ({
        username: a.username, displayName: a.displayName || null, bio: a.bio || null, phone: a.phone || '', email: a.email || null,
        country: a.country || null, created: a.created || null
      }));
      const banned = (await S.sbGetRow('banned')) || [];
      const premium = (await S.sbGetRow('premium')) || {};
      return res.status(200).json({ ok: true, listings, users, banned: Array.isArray(banned) ? banned : [], premium: Object.keys(premium) });
    }

    if(b.action === 'deleteListing'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const n = await removeListings(svcs, x => x && String(x.id) === String(b.id));
      return res.status(200).json({ ok: true, deleted: n });
    }
    if(b.action === 'deleteAllListings'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const n = await removeListings(svcs, () => true);
      return res.status(200).json({ ok: true, deleted: n });
    }

    if(b.action === 'ban'){
      const k = keyOf(b.username);
      if(!/^[a-z0-9_.\-]{3,20}$/.test(k)) return fail(res, 400, 'bad_username');
      let banned = (await S.sbGetRow('banned')) || [];
      if(!Array.isArray(banned)) banned = [];
      banned = banned.filter(x => x !== k);
      if(b.on) banned.push(k);
      await S.sbPutRow('banned', banned);
      return res.status(200).json({ ok: true });
    }

    if(b.action === 'forceLogout' || b.action === 'forceLogoutAll'){
      const fl = (await S.sbGetRow('forceLogout')) || {};
      const now = Date.now();
      const keys = b.action === 'forceLogoutAll' ? Object.keys(accounts) : [keyOf(b.username)];
      keys.forEach(k => { if(k) fl[k] = now; });
      await S.sbPutRow('forceLogout', fl);
      return res.status(200).json({ ok: true, count: keys.length });
    }

    if(b.action === 'deleteAccount'){
      const k = keyOf(b.username);
      if(!accounts[k]) return fail(res, 404, 'no_such_user');
      const note = await removeAccount(k, !!b.withListings, accounts);
      await S.sbPutRow('accounts', accounts);
      return res.status(200).json({ ok: true, notes: note });
    }

    if(b.action === 'deleteAllUsers'){
      const keys = Object.keys(accounts);
      const notes = [];
      for(const k of keys){ (await removeAccount(k, !!b.withListings, accounts)).forEach(n => notes.push(k + ':' + n)); }
      await S.sbPutRow('accounts', accounts);
      return res.status(200).json({ ok: true, deleted: keys.length, notes });
    }

    if(b.action === 'resetPassword'){
      const k = keyOf(b.username);
      if(!accounts[k]) return fail(res, 404, 'no_such_user');
      if(typeof b.newPassword !== 'string' || b.newPassword.length < 8 || b.newPassword.length > 72) return fail(res, 400, 'bad_password');
      accounts[k].hash = await S.hashPassword(b.newPassword);
      await S.sbPutRow('accounts', accounts);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'unknown_action');
  }catch(e){
    console.error('admin error', e);
    return fail(res, 500, 'server_error');
  }
};
