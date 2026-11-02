// POST /api/auth  { action: register | login | me | updateProfile | deleteAccount, ... }
// All accounts live in the private row "accounts" (read and written only with the server's service key).
// Passwords are stored only as salted scrypt hashes. A successful register/login returns a signed session token.
const S = require('./_shared');

const USERNAME_RE = /^[A-Za-z0-9_.\-]{3,10}$/;
const PHONE_RE = /^[\d\s\+\-\(\)]{6,20}$/;
const RESERVED = /(fixvice|fixlet|admin|moderator|support|staff)/;
function reserved(name){ return RESERVED.test(String(name).toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/[^a-z]/g, '')); }
function str(v, max){ return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function avRow(key){ return 'av_' + key; }
async function profileOf(a){ const av = await S.sbGetRow(avRow(String(a.username).toLowerCase())); return { username: a.username, displayName: a.displayName || null, bio: a.bio || null, avatar: av || null, phone: a.phone || '', email: a.email || null, country: a.country || null }; }
function fail(res, code, error, extra){ return res.status(code).json(Object.assign({ error }, extra || {})); }
async function isBanned(key){
  const b = await S.sbGetRow('banned');
  return Array.isArray(b) && b.map(x => String(x).toLowerCase()).includes(key);
}
function validPassword(pw){ return typeof pw === 'string' && pw.length >= 8 && pw.length <= 72; }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try{
    if(!S.serviceKey()) return fail(res, 503, 'not_configured');
    const b = req.body || {};
    const ip = S.clientIp(req);
    const accounts = (await S.sbGetRow('accounts')) || {};

    if(b.action === 'register'){
      const wait = await S.rateBlocked('register-ip:' + ip, 5, 3600 * 1000);
      if(wait) return fail(res, 429, 'rate_limited', { retryAfterSec: wait });
      const username = str(b.username, 10), key = username.toLowerCase();
      if(!USERNAME_RE.test(username)) return fail(res, 400, 'bad_username');
      if(!validPassword(b.password)) return fail(res, 400, 'bad_password');
      const phone = str(b.phone, 20);
      if(!PHONE_RE.test(phone) || !/\d{5,}/.test(phone.replace(/\D/g, ''))) return fail(res, 400, 'bad_phone');
      const email = str(b.email, 60);
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'bad_email');
      if(reserved(username)) return fail(res, 400, 'reserved_username');
      if(await isBanned(key)) return fail(res, 403, 'banned');
      if(accounts[key]) return fail(res, 409, 'username_taken');
      accounts[key] = { username, hash: await S.hashPassword(b.password), phone, email: email || null, displayName: null, bio: null, avatar: null, country: null, created: Date.now() };
      await S.sbPutRow('accounts', accounts);
      await S.rateRecord('register-ip:' + ip);
      return res.status(200).json({ ok: true, token: S.signToken(username), profile: await profileOf(accounts[key]) });
    }

    if(b.action === 'login'){
      const username = str(b.username, 20), key = username.toLowerCase();
      const w1 = await S.rateBlocked('login-user:' + key, 5, 3600 * 1000);
      const w2 = await S.rateBlocked('login-ip:' + ip, 30, 3600 * 1000);
      if(w1 || w2) return fail(res, 429, 'rate_limited', { retryAfterSec: Math.max(w1, w2) });
      const acc = accounts[key];
      const ok = !!acc && typeof b.password === 'string' && await S.verifyPassword(b.password, acc.hash);
      if(!ok){ await S.rateRecord('login-user:' + key); await S.rateRecord('login-ip:' + ip); return fail(res, 403, 'bad_credentials'); }
      if(await isBanned(key)) return fail(res, 403, 'banned');
      return res.status(200).json({ ok: true, token: S.signToken(acc.username), profile: await profileOf(acc) });
    }

    if(b.action === 'adminResetPassword'){
      // Used by the site owner when someone has forgotten their password. Needs ADMIN_KEY (set in Vercel).
      const wait = await S.rateBlocked('admin-reset:' + ip, 5, 3600 * 1000);
      if(wait) return fail(res, 429, 'rate_limited');
      const adminKey = process.env.ADMIN_KEY || '';
      if(!adminKey || typeof b.adminKey !== 'string' || b.adminKey.length !== adminKey.length || !require('crypto').timingSafeEqual(Buffer.from(b.adminKey), Buffer.from(adminKey))){
        await S.rateRecord('admin-reset:' + ip); return fail(res, 403, 'forbidden');
      }
      const k = str(b.username, 20).toLowerCase();
      if(!accounts[k]) return fail(res, 404, 'no_such_user');
      if(!validPassword(b.newPassword)) return fail(res, 400, 'bad_password');
      accounts[k].hash = await S.hashPassword(b.newPassword);
      await S.sbPutRow('accounts', accounts);
      return res.status(200).json({ ok: true });
    }

    const sess = await S.readSession(req);
    if(!sess) return fail(res, 401, 'not_signed_in');
    const acc = accounts[sess.key];
    if(!acc) return fail(res, 401, 'not_signed_in');

    if(b.action === 'me') return res.status(200).json({ ok: true, profile: await profileOf(acc) });

    if(b.action === 'updateProfile'){
      const wantsRename = typeof b.newUsername === 'string' && b.newUsername.trim() && b.newUsername.trim() !== acc.username;
      const wantsPw = b.newPassword !== undefined && b.newPassword !== '' && b.newPassword !== null;
      if(wantsRename || wantsPw){
        const wait = await S.rateBlocked('login-user:' + sess.key, 5, 3600 * 1000);
        if(wait) return fail(res, 429, 'rate_limited', { retryAfterSec: wait });
        if(!(typeof b.currentPassword === 'string' && await S.verifyPassword(b.currentPassword, acc.hash))){
          await S.rateRecord('login-user:' + sess.key); return fail(res, 403, 'bad_credentials');
        }
      }
      if(wantsPw){ if(!validPassword(b.newPassword)) return fail(res, 400, 'bad_password'); acc.hash = await S.hashPassword(b.newPassword); }
      if(b.phone !== undefined){ const ph = str(b.phone, 20); if(!PHONE_RE.test(ph) || !/\d{5,}/.test(ph.replace(/\D/g, ''))) return fail(res, 400, 'bad_phone'); acc.phone = ph; }
      if(b.email !== undefined){ const em = str(b.email, 60); if(em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return fail(res, 400, 'bad_email'); acc.email = em || null; }
      if(b.displayName !== undefined) acc.displayName = str(b.displayName, 20) || null;
      if(b.bio !== undefined) acc.bio = str(b.bio, 300) || null;
      if(b.country !== undefined) acc.country = str(b.country, 30) || null;
      if(b.avatar !== undefined){
        if(b.avatar === null || b.avatar === '') await S.sbDeleteRow(avRow(sess.key)).catch(() => {});
        else if(typeof b.avatar === 'string' && b.avatar.length <= 400000 && /^data:image\/(jpeg|png|webp);base64,/.test(b.avatar)) await S.sbPutRow(avRow(sess.key), b.avatar);
        else return fail(res, 400, 'bad_avatar');
      }
      let token = null;
      if(wantsRename){
        const nu = str(b.newUsername, 10), nk = nu.toLowerCase();
        if(!USERNAME_RE.test(nu)) return fail(res, 400, 'bad_username');
        if(reserved(nu)) return fail(res, 400, 'reserved_username');
        if(await isBanned(nk)) return fail(res, 403, 'banned');
        if(nk !== sess.key && accounts[nk]) return fail(res, 409, 'username_taken');
        const old = acc.username;
        acc.username = nu; delete accounts[sess.key]; accounts[nk] = acc;
        const oldAv = await S.sbGetRow(avRow(sess.key)); if(oldAv){ await S.sbPutRow(avRow(nk), oldAv); await S.sbDeleteRow(avRow(sess.key)).catch(() => {}); }
        await S.sbPutRow('accounts', accounts);
        await migrateUsername(old, nu, sess.key, nk);
        token = S.signToken(nu);
      } else {
        await S.sbPutRow('accounts', accounts);
      }
      return res.status(200).json({ ok: true, profile: await profileOf(acc), token });
    }

    if(b.action === 'deleteAccount'){
      const wait = await S.rateBlocked('login-user:' + sess.key, 5, 3600 * 1000);
      if(wait) return fail(res, 429, 'rate_limited', { retryAfterSec: wait });
      if(!(typeof b.password === 'string' && await S.verifyPassword(b.password, acc.hash))){ await S.rateRecord('login-user:' + sess.key); return fail(res, 403, 'bad_credentials'); }
      // 1. stop an active Premium first, so no more weekly charges are made
      const prem = (await S.sbGetRow('premium')) || {};
      const pr = prem[sess.key];
      if(pr && pr.until > Date.now() && !pr.cancelling && process.env.STRIPE_SECRET_KEY){
        try{ await S.cancelPremiumFor(sess.key); }catch(e){ return fail(res, 502, 'premium_cancel_failed'); }
      }
      // 2. listings (and their chats), then this user's threads on other listings
      const svcs = (await S.sbGetRow('svc2')) || [];
      const mine = svcs.filter(x => x && String(x.ownerCode).toLowerCase() === sess.key);
      for(const x of mine) await S.sbDeleteRow(chatRowId(x.id)).catch(() => {});
      await S.sbPutRow('svc2', svcs.filter(x => !(x && String(x.ownerCode).toLowerCase() === sess.key)));
      const idx = (await S.sbGetRow('chatidx')) || {};
      for(const sid of (idx[sess.key] || [])){
        const row = await S.sbGetRow(chatRowId(sid));
        if(row && row[acc.username]){ delete row[acc.username]; await S.sbPutRow(chatRowId(sid), row); }
      }
      delete idx[sess.key]; await S.sbPutRow('chatidx', idx);
      // 3. account and activity data
      delete accounts[sess.key]; await S.sbPutRow('accounts', accounts);
      await S.sbDeleteRow(avRow(sess.key)).catch(() => {});
      await S.sbDeleteRow('an_' + sess.key).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, 'unknown_action');
  }catch(e){
    console.error('auth error', e);
    return fail(res, 500, 'server_error');
  }
};

function chatRowId(serviceId){ return 'chat_' + String(serviceId).replace(/[^A-Za-z0-9]/g, '_'); }

// Renaming a user moves everything that points at the old name: listings, chat threads, the chat index and Premium.
async function migrateUsername(oldName, newName, oldKey, newKey){
  const svcs = (await S.sbGetRow('svc2')) || [];
  let changed = false;
  svcs.forEach(x => { if(x && String(x.ownerCode).toLowerCase() === oldKey){ x.ownerCode = newName; changed = true; } });
  if(changed) await S.sbPutRow('svc2', svcs);
  const idx = (await S.sbGetRow('chatidx')) || {};
  const ids = idx[oldKey] || [];
  for(const sid of ids){
    const row = await S.sbGetRow(chatRowId(sid));
    if(row && row[oldName]){ row[newName] = (row[newName] || []).concat(row[oldName]); delete row[oldName]; await S.sbPutRow(chatRowId(sid), row); }
  }
  if(ids.length){ idx[newKey] = Array.from(new Set((idx[newKey] || []).concat(ids))); delete idx[oldKey]; await S.sbPutRow('chatidx', idx); }
  const prem = (await S.sbGetRow('premium')) || {};
  if(prem[oldKey]){ prem[newKey] = prem[oldKey]; delete prem[oldKey]; await S.sbPutRow('premium', prem); }
}
