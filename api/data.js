// POST /api/data  { action: createService | editService | deleteService | sendMessage | getChats, ... }  + Authorization: Bearer <session token>
// Public listings live in the row "svc2" (anyone may READ it, only this server WRITES it, and always as the signed-in user).
// Chats live in private rows "chat_<serviceId>" plus an index row "chatidx"; people only ever get the threads they are part of.
const S = require('./_shared');

const CATS = ['handyman','cleaning','moving','tutoring','beauty','design_it','garden','photo','events','petcare','transport','consulting','legal','other'];
const CURRENCIES = ['NOK','SEK','DKK','ISK','EUR','USD','GBP'];
const COUNTRIES = ['Norway','Sweden','Denmark','Finland','England','Iceland'];
const FORM_FIELDS = ['address','date','time','phone','notes'];
const MAX_SERVICES_PER_USER = 30;

function str(v, max){ return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
function fail(res, code, error){ return res.status(code).json({ error }); }
function chatRowId(serviceId){ return 'chat_' + String(serviceId).replace(/[^A-Za-z0-9]/g, '_'); }
function dataUrl(v, kind, max){
  if(v === null || v === undefined || v === '') return null;
  if(typeof v !== 'string' || v.length > max) return undefined;
  const re = kind === 'video' ? /^data:video\/(mp4|webm|quicktime);base64,/ : /^data:image\/(jpeg|png|webp);base64,/;
  return re.test(v) ? v : undefined;
}
function countWords(t){ return (t.match(/\S+/g) || []).length; }

// Validates the fields of a listing and returns a clean object, or { error }.
function cleanListing(f, partial){
  const out = {};
  const need = (k) => !partial || f[k] !== undefined;
  if(need('name')){ const v = str(f.name, 200); if(!v || countWords(v) > 20) return { error: 'bad_name' }; out.name = v; }
  if(need('desc')){ const v = str(f.desc, 400); if(!v) return { error: 'bad_desc' }; out.desc = v; }
  if(need('cat')){ if(!CATS.includes(f.cat)) return { error: 'bad_category' }; out.cat = f.cat; }
  if(need('price')){ const v = Number(f.price); if(!isFinite(v) || v <= 0 || v >= 1000000) return { error: 'bad_price' }; out.price = v; }
  if(need('currency')){ if(!CURRENCIES.includes(f.currency)) return { error: 'bad_currency' }; out.currency = f.currency; }
  if(f.priceNote !== undefined) out.priceNote = str(f.priceNote, 40) || null;
  if(need('image')){ const v = dataUrl(f.image, 'image', 1500000); if(!v) return { error: 'bad_image' }; out.image = v; }
  if(f.video !== undefined){ const v = dataUrl(f.video, 'video', 6000000); if(v === undefined) return { error: 'bad_video' }; out.video = v; }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try{
    if(!S.serviceKey()) return fail(res, 503, 'not_configured');
    const sess = await S.readSession(req);
    if(!sess) return fail(res, 401, 'not_signed_in');
    const b = req.body || {};
    const me = sess.username, meKey = sess.key;
    const ownerOf = (x) => String(x.ownerCode).toLowerCase();

    if(b.action === 'createService'){
      const wait = await S.rateBlocked('create:' + meKey, 20, 3600 * 1000);
      if(wait) return fail(res, 429, 'rate_limited');
      const f = b.service || {};
      const c = cleanListing(f, false); if(c.error) return fail(res, 400, c.error);
      if(!Array.isArray(f.locations) || !f.locations.length || f.locations.length > 6) return fail(res, 400, 'bad_locations');
      const locations = [];
      for(const loc of f.locations){
        if(!loc || !COUNTRIES.includes(loc.country) || !Array.isArray(loc.cities) || !loc.cities.length || loc.cities.length > 500) return fail(res, 400, 'bad_locations');
        locations.push({ country: loc.country, cities: loc.cities.map(x => str(x, 60)).filter(Boolean) });
      }
      const svcs = (await S.sbGetRow('svc2')) || [];
      if(svcs.filter(x => x && ownerOf(x) === meKey).length >= MAX_SERVICES_PER_USER) return fail(res, 400, 'too_many_services');
      const service = Object.assign({
        id: Date.now() + Math.random(), locations,
        cities: locations.flatMap(l => l.cities), country: locations.map(l => l.country).join(', '),
        lang: str(f.lang, 5) || 'no', createdAt: Date.now(), sponsored: false, ownerCode: me
      }, c);
      svcs.unshift(service);
      await S.sbPutRow('svc2', svcs);
      await S.rateRecord('create:' + meKey);
      return res.status(200).json({ ok: true, service });
    }

    if(b.action === 'editService'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const x = svcs.find(s => s && String(s.id) === String(b.id));
      if(!x) return fail(res, 404, 'not_found');
      if(ownerOf(x) !== meKey) return fail(res, 403, 'not_owner');
      const c = cleanListing(b.fields || {}, true); if(c.error) return fail(res, 400, c.error);
      Object.assign(x, c, { editedAt: Date.now() });
      await S.sbPutRow('svc2', svcs);
      return res.status(200).json({ ok: true, service: x });
    }

    if(b.action === 'deleteService'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const x = svcs.find(s => s && String(s.id) === String(b.id));
      if(!x) return res.status(200).json({ ok: true });
      if(ownerOf(x) !== meKey) return fail(res, 403, 'not_owner');
      await S.sbPutRow('svc2', svcs.filter(s => s !== x));
      await S.sbDeleteRow(chatRowId(x.id)).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    if(b.action === 'sendMessage'){
      const wait = await S.rateBlocked('msg:' + meKey, 120, 3600 * 1000);
      if(wait) return fail(res, 429, 'rate_limited');
      const svcs = (await S.sbGetRow('svc2')) || [];
      const x = svcs.find(s => s && String(s.id) === String(b.serviceId));
      if(!x) return fail(res, 404, 'not_found');
      const isOwner = ownerOf(x) === meKey;
      const rowId = chatRowId(x.id);
      const row = (await S.sbGetRow(rowId)) || {};
      // A customer talks in their own thread; the owner can only answer threads that a customer already started.
      let thread;
      if(isOwner){
        thread = Object.keys(row).find(k => k.toLowerCase() === String(b.customer || '').toLowerCase());
        if(!thread) return fail(res, 403, 'no_such_thread');
      } else { thread = me; }
      const p = b.payload || {};
      const msg = { time: Date.now(), from: isOwner ? 'owner' : 'customer' };
      const type = p.type;
      if(type === undefined || type === null){ msg.text = str(p.text, 2000); if(!msg.text) return fail(res, 400, 'empty'); }
      else if(type === 'image'){ const im = dataUrl(p.image, 'image', 400000); if(!im) return fail(res, 400, 'bad_image'); msg.type = 'image'; msg.image = im; msg.text = '📷 Bilde'; }
      else if(type === 'form'){
        const fields = Array.isArray(p.fields) ? p.fields.filter(f => FORM_FIELDS.includes(f)) : [];
        if(!fields.length) return fail(res, 400, 'bad_form');
        msg.type = 'form'; msg.formId = 'f' + msg.time; msg.fields = fields; msg.note = str(p.note, 200); msg.answered = false;
        msg.text = '📋 Opplysninger forespurt';
      } else if(type === 'formReply'){
        const answers = {};
        FORM_FIELDS.forEach(k => { if(p.answers && typeof p.answers[k] === 'string') answers[k] = str(p.answers[k], 200); });
        msg.type = 'formReply'; msg.formId = str(p.formId, 40); msg.answers = answers;
        msg.text = '📋 Opplysninger sendt';
        (row[thread] || []).forEach(m => { if(m.type === 'form' && m.formId === msg.formId) m.answered = true; });
      } else return fail(res, 400, 'bad_type');
      row[thread] = (row[thread] || []).concat(msg).slice(-500);
      await S.sbPutRow(rowId, row);
      // index: both people can find this thread later
      const idx = (await S.sbGetRow('chatidx')) || {};
      for(const k of [meKey, ownerOf(x), thread.toLowerCase()]){ idx[k] = Array.from(new Set((idx[k] || []).concat(String(x.id)))); }
      await S.sbPutRow('chatidx', idx);
      await S.rateRecord('msg:' + meKey);
      return res.status(200).json({ ok: true, message: msg, thread });
    }

    if(b.action === 'getChats'){
      const svcs = (await S.sbGetRow('svc2')) || [];
      const idx = (await S.sbGetRow('chatidx')) || {};
      const ids = new Set((idx[meKey] || []).map(String));
      svcs.forEach(x => { if(x && ownerOf(x) === meKey) ids.add(String(x.id)); });
      const rowIds = [...ids].map(chatRowId);
      const rows = await S.sbGetRows(rowIds);
      const out = {};
      for(const sid of ids){
        const row = rows[chatRowId(sid)]; if(!row) continue;
        const svc = svcs.find(s => s && String(s.id) === sid); if(!svc) continue;
        const owner = ownerOf(svc) === meKey;
        const threads = {};
        Object.keys(row).forEach(k => { if(owner || k.toLowerCase() === meKey) threads[k] = row[k]; });
        if(Object.keys(threads).length) out[sid] = threads;
      }
      return res.status(200).json({ ok: true, chats: out });
    }

    return fail(res, 400, 'unknown_action');
  }catch(e){
    console.error('data error', e);
    return fail(res, 500, 'server_error');
  }
};
