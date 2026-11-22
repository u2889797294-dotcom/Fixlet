// Anti-spam helpers: a tiny self-hosted captcha (signed maths question), blocked email domains,
// and checks for repeated or look-alike accounts and listings. No external service needed.
const crypto = require('crypto');
const S = require('./_shared');

function secret(){ return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY || ''; }
function sign(body){ return crypto.createHmac('sha256', secret()).update(body).digest('hex').slice(0, 32); }

// ---- captcha: "What is 7 + 5?" The answer is never sent to the browser; only a signed token that proves it. ----
const WORDS = ['null','en','to','tre','fire','fem','seks','sju','åtte','ni'];
function newCaptcha(){
  const a = 2 + crypto.randomInt(8), b = 2 + crypto.randomInt(8);
  const minus = crypto.randomInt(2) === 1 && a > b;
  const ans = minus ? a - b : a + b;
  const exp = Date.now() + 15 * 60 * 1000, nonce = crypto.randomBytes(6).toString('hex');
  const body = [ans, exp, nonce].join('.');
  return { question: 'Hva er ' + WORDS[a] + (minus ? ' minus ' : ' pluss ') + WORDS[b] + '? (skriv tallet)', token: body + '.' + sign(body) };
}
function checkCaptcha(token, answer){
  try{
    const p = String(token || '').split('.');
    if(p.length !== 4) return false;
    const body = p.slice(0, 3).join('.');
    const want = sign(body);
    if(p[3].length !== want.length || !crypto.timingSafeEqual(Buffer.from(p[3]), Buffer.from(want))) return false;
    if(Number(p[1]) < Date.now()) return false;
    return String(parseInt(String(answer).trim(), 10)) === p[0];
  }catch(e){ return false; }
}

// ---- email ----
// example.com / exsample.com and typo variants, plus well-known throwaway inboxes.
const FAKE_DOMAIN = /^(.*\.)?(ex+[a-z]*mple|test|testing|fake|invalid|localhost)\.[a-z.]+$/i;
const DISPOSABLE = new Set(['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','temp-mail.org','yopmail.com','trashmail.com','sharklasers.com','getnada.com','dispostable.com','throwawaymail.com','maildrop.cc','fakeinbox.com']);
function badEmailDomain(email){
  const d = String(email || '').toLowerCase().split('@')[1] || '';
  return !!d && (FAKE_DOMAIN.test(d) || DISPOSABLE.has(d));
}

// ---- text ----
function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9æøåäö]+/g, ' ').trim(); }
// "aaaaaa", "asdasdasdasd", the same word again and again, or almost no variety in a long text.
function looksRepetitive(s){
  const t = norm(s).replace(/ /g, '');
  if(t.length < 8) return false;
  if(/(.)\1{5,}/.test(t)) return true;
  if(/(.{2,5})\1{3,}/.test(t)) return true;
  const words = norm(s).split(' ');
  if(words.length >= 6 && new Set(words).size / words.length < 0.4) return true;
  return new Set(t).size < 4;
}

// ---- accounts ----
// Same email/phone on many accounts, or several new accounts with look-alike names (shkva1, shkvb2, shkvc3 ...) is a bot pattern.
function accountProblem(accounts, username, phone, email){
  const list = Object.values(accounts || {}).filter(a => a && a.username);
  const digits = String(phone || '').replace(/\D/g, '');
  if(digits && list.filter(a => String(a.phone || '').replace(/\D/g, '') === digits).length >= 2) return 'too_many_accounts';
  if(email && list.filter(a => a.email && String(a.email).toLowerCase() === String(email).toLowerCase()).length >= 2) return 'too_many_accounts';
  if(looksRepetitive(username) || /^(.)\1+$/.test(username.replace(/[\d_.\-]/g, ''))) return 'spam_username';
  const base = username.toLowerCase().replace(/[^a-z]/g, '').slice(0, 4);
  if(base.length >= 3){
    const recent = list.filter(a => Date.now() - (a.created || 0) < 24 * 3600 * 1000 && String(a.username).toLowerCase().replace(/[^a-z]/g, '').slice(0, 4) === base);
    if(recent.length >= 2) return 'spam_username';
  }
  return null;
}

// ---- listings ----
function listingProblem(existing, meKey, ownerOf, c){
  const text = norm((c.name || '') + ' ' + (c.desc || ''));
  if(looksRepetitive(c.name) || looksRepetitive(c.desc)) return 'spam_listing';
  const name = norm(c.name);
  for(const x of existing){
    if(!x) continue;
    const same = norm(x.name) === name || norm((x.name || '') + ' ' + (x.desc || '')) === text;
    if(same && ownerOf(x) === meKey) return 'duplicate_listing';
  }
  // the exact same text posted by other accounts: copy/paste spam
  if(existing.filter(x => x && ownerOf(x) !== meKey && norm((x.name || '') + ' ' + (x.desc || '')) === text).length >= 2) return 'duplicate_listing';
  return null;
}

module.exports = { newCaptcha, checkCaptcha, badEmailDomain, accountProblem, listingProblem, looksRepetitive };
