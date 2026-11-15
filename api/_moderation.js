// Automatic moderation of listings against the Terms (section 9.1). Runs on the SERVER, so it cannot be bypassed in the browser.
//   verdict "block"  -> clear violation, the listing is rejected with a message.
//   verdict "review" -> borderline, the listing is held back until an admin approves it.
//   verdict "ok"     -> published straight away.
const BAD_EXACT = ('dick cock prick twat cum tits fag fags coon spic kike gook chink paki dyke jizz sluts cunt cunts wank wanker tranny retard retarded spastic pussy bollocks arse ' +
  'kuk pikk pik fitte fitta fisse hore hora hure luder subba knulle knull knulla knepp kneppe pule piss pisse skit lort røv röv neger negr svarting blatte bög bøsserøv mongo idiot homo ' +
  'ryssa paska pillu kyrpä runkkari vitun jumalauta neekeri faen fanden kjerring kælling bitte ' +
  'nazi nazis nazism nazist neonazi kkk lsd weed xxx').split(' ');
const BAD_PREFIX = ('fuck fvck fuk shit bitch bastard asshole arsehole motherf nigg faggot whore porn cocksuck dickhead jackass dumbass dipshit bullshit horseshit ' +
  'dritt jævl jævel jævla jävl jävel helvete satan perkele vittu saatana paskiai kusipää kusipaa huora mulkku haistapaska pedo paedo rapist hitler ' +
  'kokain cocaine heroin fentanyl mdma amfetamin amphetamin methamph crystalmeth marijuana marihuana hitman leiemorder escort prostitu onlyfans sexshop sexclub sexklubb sexservice ' +
  'slutty fakeid falskid counterfeit').split(' ');
const BAD_STRICT = ('fuck nigger nigga faggot whore bitch vittu perkele saatana jävla jævla porn asshole').split(' ');
const FILTER_SAFE = ['shiitake','shitake'];
const RESERVED_CONTAINS = ['fixvice','fixlet','fixle','admin','moderator','transform4future'];
const RESERVED_EXACT = ['support','staff','official','owner','ceo','system','root','mod','help','helpline','team','security','null','undefined','owneradmin'];
function _collapse(w){ return w.replace(/(.)\1+/g,'$1'); }
function _stripAccents(str){
  // remove accents but keep the Nordic letters å ä ö æ ø intact
  return String(str||'').toLowerCase().replace(/[^\u0000-\u007f]/g, ch=>{
    if('åäöæøü'.includes(ch)) return ch;
    return ch.normalize('NFD').replace(/[̀-ͯ]/g,'');
  });
}
function _leet(str){ return str.replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t').replace(/@/g,'a').replace(/\$/g,'s').replace(/!/g,'i').replace(/€/g,'e'); }
function _words(str){ return str.split(/[^a-zæøåäöü]+/).filter(Boolean); }
const _EX = new Set(BAD_EXACT.map(_collapse)), _PF = BAD_PREFIX.map(_collapse), _ST = BAD_STRICT.map(_collapse);
function findBadWord(text, strict){
  const base = _stripAccents(text);
  const variants = [base, _leet(base)];
  for(const v of variants){
    const words = _words(v);
    for(const w of words){
      const c = _collapse(w);
      if(FILTER_SAFE.includes(w)) continue;
      if(_EX.has(c)) return w;
      for(const p of _PF){ if(c.startsWith(p)) return w; }
    }
    // single letters/syllables split up with spaces, dots or dashes ("f u c k", "f.u.c.k")
    const joined = _collapse(v.replace(/[^a-zæøåäöü]+/g,''));
    if(strict || words.length > 1){
      for(const p of _ST){ if(joined.includes(p)) return p; }
    }
  }
  return null;
}

// Phrases that are clearly not allowed (ToS 9.1 a, f, g, h). Matched on the normalised text, spaces collapsed.
const BLOCK_PHRASES = [
  ['sexy massasje','sex'],['erotisk','sex'],['happy ending','sex'],['sensuell massasje','sex'],['nuru','sex'],['sexchat','sex'],['nakenmodell','sex'],['betalt sex','sex'],
  ['falske papirer','forged'],['falskt pass','forged'],['falsk pass','forged'],['falskt forerkort','forged'],['falskt førerkort','forged'],['forfalsk','forged'],['kjop av vitnemal','forged'],['kjøp av vitnemål','forged'],['falsk legeattest','forged'],['falske sertifikat','forged'],
  ['hacking','hack'],['hacke konto','hack'],['hacke instagram','hack'],['hacke facebook','hack'],['hacke snapchat','hack'],['ddos','hack'],['phishing','hack'],['stjel passord','hack'],['stjele passord','hack'],['kredittkortsvindel','fraud'],['svindel','fraud'],
  ['stjalet','stolen'],['stjålet','stolen'],['stjalne','stolen'],['stjålne','stolen'],['hehleri','stolen'],
  ['selvmord','selfharm'],['selvskading','selfharm']
];
// Borderline: could be fine, but an admin should look first (ToS 9.1 b, g).
const REVIEW_PHRASES = [
  ['vapen','weapons'],['våpen','weapons'],['pistol','weapons'],['revolver','weapons'],['ammunisjon','weapons'],['kniv til salgs','weapons'],['skytevapen','weapons'],
  ['send penger forst','scam'],['send penger først','scam'],['betal pa forhand','scam'],['betal på forhånd','scam'],['forskudd','scam'],['garantert gevinst','scam'],['garantert inntekt','scam'],['bli rik','scam'],['rask inntekt','scam'],['gratis penger','scam'],['bitcoin','scam'],['krypto','scam'],['investering','scam'],['pyramide','scam'],['nettverksmarkedsforing','scam'],
  ['100% garanti','scam'],['sykemelding','medical'],['sykmelding','medical'],['resept','medical'],['reseptfri','medical'],['anabole','medical'],['steroid','medical'],
  ['alkohol','alcohol'],['tobakk','alcohol'],['snus til salgs','alcohol'],['vape','alcohol']
];
const REASON_TEXT = {
  badword: 'språk eller innhold som ikke er tillatt (banning, hatefulle ytringer eller forbudte tjenester)',
  brand: 'navn eller merke som ligner Fixvice',
  sex: 'seksuelle tjenester eller eksplisitt innhold',
  forged: 'forfalskede dokumenter eller bevis',
  hack: 'hacking, svindel eller uautorisert tilgang',
  fraud: 'svindel',
  stolen: 'stjålne varer',
  selfharm: 'selvskading eller selvmord',
  weapons: 'våpen',
  scam: 'tegn på svindel eller urealistiske løfter',
  medical: 'medisinske eller reseptbelagte produkter',
  alcohol: 'alkohol, tobakk eller lignende'
};
function plain(text){ return _collapse(_stripAccents(text).replace(/[^a-z0-9æøåäöü%]+/g,' ').trim()).replace(/\s+/g,' '); }
function flat(text){ return _stripAccents(text).replace(/[^a-z0-9æøåäöü%]+/g,' ').replace(/\s+/g,' ').trim(); }

// fields: { name, desc, priceNote }. Returns { verdict, reasons: [codes] }.
function moderate(fields){
  const parts = [fields.name, fields.desc, fields.priceNote].filter(v => typeof v === 'string' && v);
  const text = parts.join(' . ');
  const reasons = [];
  const blocks = new Set(), reviews = new Set();
  if(findBadWord(text, false)) blocks.add('badword');
  const nameFlat = _leet(_stripAccents(String(fields.name || ''))).replace(/[^a-z0-9]+/g, '');
  if(/fixvice|fixlet|transform4future/.test(nameFlat)) blocks.add('brand');
  const f = ' ' + flat(text) + ' ';
  const f2 = ' ' + flat(_leet(_stripAccents(text))) + ' ';
  for(const [p, code] of BLOCK_PHRASES){ const q = flat(p); if(f.includes(q) || f2.includes(q)) blocks.add(code); }
  for(const [p, code] of REVIEW_PHRASES){ const q = flat(p); if(f.includes(q)) reviews.add(code); }
  // Long digit strings and e-mail addresses in a public listing are held for a look (ToS 9.1 j: other people's data).
  if(/\b\d{3}[\s.-]?\d{2}[\s.-]?\d{3}\b|\b\d{8,}\b/.test(text) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) reviews.add('contact');
  if(blocks.size) return { verdict: 'block', reasons: [...blocks] };
  if(reviews.size) return { verdict: 'review', reasons: [...reviews] };
  return { verdict: 'ok', reasons: [] };
}
REASON_TEXT.contact = 'telefonnummer eller e-postadresse i annonsen';
function reasonText(codes){ return (codes || []).map(c => REASON_TEXT[c] || c).join(', '); }

module.exports = { moderate, reasonText };
