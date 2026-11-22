// Genererer statiske SEO-sider: /tjenester/<tjeneste>-<by>/index.html, hub, sitemap.xml og robots.txt
// Kjør: node tools/gen-seo.js   (commit resultatet; Vercel serverer filene som de er)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://fixvice.com';
const TODAY = new Date().toISOString().slice(0, 10);

const cities = [
  { slug: 'oslo', name: 'Oslo', loc: 'i Oslo', areas: ['Grünerløkka', 'Frogner', 'St. Hanshaugen', 'Sagene', 'Nordstrand', 'Østensjø'], blurb: 'Oslo er landets tettest befolkede by, og mange bor i leiligheter og bofellesskap der små jobber må løses raskt.' },
  { slug: 'oppegard', name: 'Oppegård', loc: 'i Oppegård', areas: ['Kolbotn', 'Greverud', 'Myrvoll', 'Oppegård stasjon', 'Solbråtan'], blurb: 'Oppegård ligger sør for Oslo, med mange eneboliger, rekkehus og borettslag langs Østfoldbanen.' },
  { slug: 'kolbotn', name: 'Kolbotn', loc: 'på Kolbotn', areas: ['Kolbotn sentrum', 'Greverud', 'Rustadsagen', 'Solbråtan', 'Ljan-grensen'], blurb: 'Kolbotn er et av de største sentrene i Nordre Follo, med boligområder i skråninger og mye hage og tomt.' },
  { slug: 'ski', name: 'Ski', loc: 'i Ski', areas: ['Ski sentrum', 'Langhus', 'Kråkstad', 'Siggerud', 'Hebekk'], blurb: 'Ski er hovedsenteret i Nordre Follo, med både tett bebyggelse rundt togstasjonen og store boligfelt utenfor.' },
  { slug: 'as', name: 'Ås', loc: 'i Ås', areas: ['Ås sentrum', 'Nordby', 'Vinterbro', 'Brønnerud', 'Åsgård'], blurb: 'Ås har mange studenter, barnefamilier og småbrukere, og behovet for fleksible tjenester er stort.' },
  { slug: 'nesodden', name: 'Nesodden', loc: 'på Nesodden', areas: ['Nesoddtangen', 'Fagerstrand', 'Tangen', 'Bjørnemyr', 'Alværn'], blurb: 'Nesodden ligger på halvøya sør for Oslo, der mange hus har store tomter og bruker båt eller bil til jobb.' },
  { slug: 'drobak', name: 'Drøbak', loc: 'i Drøbak', areas: ['Drøbak sentrum', 'Seiersten', 'Belsjø', 'Heer', 'Son-veien'], blurb: 'Drøbak er en gammel småby ved fjorden, med mange eldre trehus som trenger vedlikehold og kyndige hender.' },
  { slug: 'asker', name: 'Asker', loc: 'i Asker', areas: ['Asker sentrum', 'Hvalstad', 'Vollen', 'Heggedal', 'Billingstad'], blurb: 'Asker har mange eneboliger og hytter, og folk setter pris på hjelp med både hus, hage og hverdag.' },
  { slug: 'baerum', name: 'Bærum', loc: 'i Bærum', areas: ['Sandvika', 'Stabekk', 'Lysaker', 'Høvik', 'Østerås'], blurb: 'Bærum er en av landets største kommuner, med mange større boliger og travle småbarnsfamilier.' },
  { slug: 'lillestrom', name: 'Lillestrøm', loc: 'i Lillestrøm', areas: ['Lillestrøm sentrum', 'Strømmen', 'Skedsmokorset', 'Kjeller', 'Fetsund'], blurb: 'Lillestrøm vokser raskt, med nye boliger i sentrum og eldre villaer i områdene rundt.' },
  { slug: 'drammen', name: 'Drammen', loc: 'i Drammen', areas: ['Bragernes', 'Strømsø', 'Konnerud', 'Gulskogen', 'Marienlyst'], blurb: 'Drammen er en stor by ved elven, med blanding av bygårder i sentrum og eneboliger i åsene rundt.' },
  { slug: 'moss', name: 'Moss', loc: 'i Moss', areas: ['Moss sentrum', 'Jeløya', 'Kambo', 'Rygge', 'Refsnes'], blurb: 'Moss er kjent for Jeløya og bryggene, og har mange boliger med hage og utsikt over fjorden.' },
];

const services = [
  { slug: 'altmuligmann', name: 'Altmuligmann', what: 'altmuligmann', cat: 'Små reparasjoner og montering',
    intro: 'Trenger du hjelp til småjobber hjemme, som å henge opp hyller, montere kjøkkenskap eller fikse en dør som henger? En altmuligmann tar seg av oppdragene som er for små til et stort firma.',
    tasks: ['Montere IKEA-møbler og kjøkkeninnredning', 'Henge opp bilder, hyller, TV og gardinstenger', 'Tette lister, justere dører og skifte lås', 'Småreparasjoner av terrasse, gjerde og utebod', 'Hjelp med silikon, fuging og enkel maling'],
    tips: ['Beskriv jobben tydelig og legg ved et bilde.', 'Avtal om verktøy og materialer er inkludert.', 'Spør om han eller hun har ansvarsforsikring.'],
    faq: [['Hva koster en altmuligmann?', 'Prisen avhenger av jobben og hvor lang tid den tar. Mange tar timepris, andre gir en fastpris når de har sett oppdraget. Be om tilbud fra flere og sammenlign.'], ['Kan en altmuligmann gjøre elektrisk arbeid?', 'Nei. Arbeid på fast elektrisk installasjon må gjøres av en registrert elektriker. Altmuligmenn tar mekaniske småjobber.']] },
  { slug: 'maler', name: 'Maler', what: 'maler', cat: 'Maling og overflater',
    intro: 'Skal du male stue, soverom eller hele huset? En maler gir deg jevne flater, ryddig arbeid og riktig materialvalg, så resultatet varer.',
    tasks: ['Innvendig maling av vegger, tak og lister', 'Utvendig maling av hus, vindu og dør', 'Sparkling og forbehandling av flater', 'Lakkering av dører, karmer og trapper', 'Tapetsering og oppussing før salg'],
    tips: ['Oppgi areal og antall rom, eller send bilder.', 'Spør hva som er inkludert: sparkling, maling og rydding.', 'Avtal fargevalg og tidsplan på forhånd.'],
    faq: [['Hvor lang tid tar det å male et rom?', 'Et vanlig rom tar ofte en til to dager med forarbeid og to strøk. Større rom eller mye sparkling tar lenger tid.'], ['Må jeg flytte møblene selv?', 'Avtal det med maleren. Mange hjelper til med å skyve møbler og dekke til, men det er lurt å tømme gulvet for småting.']] },
  { slug: 'rengjoring', name: 'Rengjøring', what: 'rengjøringshjelp', cat: 'Husvask og flyttevask',
    intro: 'Få hjelp til ukentlig vask, storrengjøring eller flyttevask. Rengjøringshjelp gir deg mer tid, og en ryddig bolig uten stress.',
    tasks: ['Fast ukentlig eller annenhver ukes husvask', 'Flyttevask med godkjent resultat', 'Storrengjøring før gjester eller høytid', 'Vinduspuss inne og ute', 'Byggvask etter oppussing'],
    tips: ['Avklar hva som skal vaskes og hvor ofte.', 'Spør om rengjøringsmidler og utstyr er inkludert.', 'Be om fast pris for flyttevask, gjerne med garanti.'],
    faq: [['Hva er forskjellen på vanlig vask og flyttevask?', 'Flyttevask er grundigere og inkluderer for eksempel skap, ovn, kjøleskap og vindu, slik at boligen kan overleveres.'], ['Kan jeg få fast hjelp hver uke?', 'Ja. Mange som tilbyr rengjøring tar faste oppdrag. Avtal dag, tid og omfang direkte med dem.']] },
  { slug: 'flyttehjelp', name: 'Flyttehjelp', what: 'flyttehjelp', cat: 'Flytting og transport',
    intro: 'Skal du flytte? Flyttehjelp sparer ryggen din. Du kan få hjelp til å bære, pakke og kjøre, enten du flytter en leilighet eller et helt hus.',
    tasks: ['Bæring av møbler og kasser', 'Transport med varebil', 'Hjelp med pakking og demontering', 'Henting av store ting som sofa og seng', 'Kjøring til gjenbruksstasjon etter flytting'],
    tips: ['Oppgi etasje, heis og avstand mellom adressene.', 'Avklar om varebil og pakkemateriell er med.', 'Bestill tidlig før månedsskifte og helger.'],
    faq: [['Hva skjer hvis noe går i stykker?', 'Spør flytterne om forsikring før dere starter, og ta bilde av verdifulle ting på forhånd.'], ['Hvor mange personer trenger jeg?', 'To personer klarer en liten leilighet. Til et hus eller tunge ting er tre til fire tryggere.']] },
  { slug: 'hagearbeid', name: 'Hagearbeid', what: 'hagehjelp', cat: 'Hage og uteområde',
    intro: 'Slå gresset, klipp hekken eller rydd hagen før sesongen. Med hagehjelp holder du uteområdet pent uten å bruke helgene på det.',
    tasks: ['Gressklipp og kantklipping', 'Hekkeklipp og beskjæring av busker og trær', 'Ugressfjerning og bedstell', 'Rydding av løv, kvister og hageavfall', 'Planting og oppsett av bed'],
    tips: ['Oppgi tomtestørrelse og hva som skal gjøres.', 'Avklar hvem som tar med avfall.', 'Bestill i god tid før vår og høst.'],
    faq: [['Når bør jeg bestille hagehjelp?', 'Mars til mai for vårrydding og september til oktober for løv og klipp. Bestill gjerne en uke eller to i forveien.'], ['Kan jeg få fast hjelp gjennom sesongen?', 'Ja, mange avtaler fast klipping hver uke eller annenhver uke fra mai til september.']] },
  { slug: 'leksehjelp', name: 'Leksehjelp', what: 'leksehjelp', cat: 'Undervisning',
    intro: 'Slit med matte, norsk eller engelsk? Leksehjelp gir eleven trygghet og bedre forståelse, enten det gjelder ungdomsskole, videregående eller studier.',
    tasks: ['Matematikk og realfag', 'Norsk, engelsk og andre språk', 'Eksamensforberedelser og prøvelesing', 'Hjelp med innleveringer og prosjektoppgaver', 'Fast ukentlig oppfølging'],
    tips: ['Fortell hvilket fag og hvilket trinn eleven går på.', 'Avtal om undervisningen skjer hjemme, på bibliotek eller nett.', 'Start med en prøvetime for å se om det passer.'],
    faq: [['Hvor ofte bør eleven ha leksehjelp?', 'Det varierer. En time i uken gir ofte god effekt, og før eksamen kan flere timer være nyttig.'], ['Kan leksehjelpen foregå på nett?', 'Ja, mange tilbyr både hjemmebesøk og nettundervisning.']] },
  { slug: 'frisor', name: 'Frisør', what: 'frisør', cat: 'Hår og skjønnhet',
    intro: 'Få klipp, farge eller styling av frisører som kommer hjem til deg eller har egen stol. Finn en frisør som passer stilen og lommeboka.',
    tasks: ['Dameklipp, herreklipp og barneklipp', 'Farging, striper og toning', 'Styling til bryllup, fest og konfirmasjon', 'Skjeggtrim og barbering', 'Hjemmebesøk for eldre og småbarnsfamilier'],
    tips: ['Se bilder av tidligere arbeid.', 'Be om en pris før du bestiller, spesielt for farge.', 'Avtal sted: hos frisøren eller hjemme hos deg.'],
    faq: [['Kan frisøren komme hjem til meg?', 'Mange tilbyr hjemmebesøk. Skriv det i meldingen når du tar kontakt.'], ['Hva koster det å farge håret?', 'Prisen avhenger av hårlengde og fargemetode. Spør etter en pris på forhånd, så slipper du overraskelser.']] },
  { slug: 'fotograf', name: 'Fotograf', what: 'fotograf', cat: 'Foto og film',
    intro: 'Skal du ha portretter, bryllupsbilder eller bilder til nettsiden? Finn en fotograf som kjenner området og kan levere bilder du blir glad i.',
    tasks: ['Portretter, familie- og barnebilder', 'Bryllup, dåp og konfirmasjon', 'Bedriftsbilder og produktfoto', 'Eiendomsfoto til boligsalg', 'Arrangement og fest'],
    tips: ['Se porteføljen og velg en stil du liker.', 'Avklar leveringstid og antall bilder.', 'Spør om rettigheter hvis bildene skal brukes kommersielt.'],
    faq: [['Hvor lang tid tar det å få bildene?', 'Det varierer fra et par dager til noen uker. Avtal leveringstid før dere starter.'], ['Kan jeg bruke bildene i markedsføring?', 'Det avhenger av avtalen med fotografen. Spør om bruksrett og skriv det ned.']] },
  { slug: 'hundepass', name: 'Hundepass', what: 'hundepass', cat: 'Kjæledyr',
    intro: 'Skal du på jobb, ferie eller helgetur? Finn en trygg person som lufter hunden, passer den hjemme eller tar den med på tur.',
    tasks: ['Lufting og gåturer i løpet av dagen', 'Hundepass hjemme hos deg eller hos passeren', 'Pass i ferier og helger', 'Hundebarnehage og aktivisering', 'Pass av katt og andre kjæledyr'],
    tips: ['Møt passeren på forhånd, sammen med hunden.', 'Fortell om rutiner, mat og helse.', 'Avklar hvem som kontaktes hvis noe skjer.'],
    faq: [['Hvor mye koster hundepass?', 'Prisen avhenger av lengden, om hunden er hjemme hos deg eller passeren, og om det er helg eller høytid.'], ['Kan jeg møte passeren først?', 'Ja, og det anbefales. Be om en prøvetur, så ser du hvordan hunden og passeren fungerer sammen.']] },
  { slug: 'webdesign', name: 'Webdesign', what: 'webdesigner', cat: 'Nettsider og IT',
    intro: 'Trenger du en nettside til bedriften, en nettbutikk eller en enkel landingsside? Finn en freelancer som kan bygge den, og som forklarer det på norsk.',
    tasks: ['Enkle nettsider for små bedrifter', 'Nettbutikk og betalingsløsning', 'Redesign av gammel nettside', 'Søkemotoroptimalisering og Google-oppføring', 'Logo og enkel profil'],
    tips: ['Fortell hva siden skal brukes til.', 'Avklar hvem som eier domene og innhold.', 'Be om referanser og eksempler på arbeid.'],
    faq: [['Hva koster en enkel nettside?', 'Det avhenger av omfanget. En enkel side koster mindre enn en nettbutikk. Be om tilbud fra flere.'], ['Eier jeg nettsiden selv?', 'Du bør det. Avtal at domene og innhold registreres på deg.']] },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonld = o => JSON.stringify(o).replace(/</g, '\\u003c');
const url = (s, c) => `/tjenester/${s.slug}-${c.slug}/`;

const CSS = `:root{--teal:#0d9488;--green:#7ac943;--ink:#0f2620;--soft:#4d635c;--line:#e7f0ec;--mist:#f2f8f5;--bg:#fff}
@media(prefers-color-scheme:dark){:root{--ink:#e8f3ef;--soft:#a5b9b1;--line:#24403a;--mist:#12231f;--bg:#0b1714}}
*{box-sizing:border-box}body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--teal)}header{border-bottom:1px solid var(--line)}
.wrap{max-width:760px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-left))}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:800;font-size:22px;text-decoration:none;background:linear-gradient(90deg,var(--teal),var(--green));-webkit-background-clip:text;background-clip:text;color:transparent}
nav.crumb{font-size:14px;color:var(--soft);padding:16px 0 0}nav.crumb a{color:var(--soft)}
h1{font-size:clamp(28px,6vw,40px);line-height:1.15;margin:12px 0}h2{font-size:22px;margin:36px 0 8px}
.lead{font-size:19px;color:var(--soft)}
.cta{display:inline-block;margin:12px 0;padding:14px 22px;border-radius:12px;background:linear-gradient(90deg,var(--teal),var(--green));color:#fff;font-weight:700;text-decoration:none}
.cta.alt{background:none;color:var(--teal);border:2px solid var(--teal)}
ul{padding-left:20px}li{margin:6px 0}.box{background:var(--mist);border-radius:14px;padding:16px 20px;margin:20px 0}
.links{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.links a{display:block;padding:6px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:15px}
details{border-bottom:1px solid var(--line);padding:10px 0}summary{cursor:pointer;font-weight:600}
footer{margin-top:56px;border-top:1px solid var(--line);padding:24px 0 40px;font-size:14px;color:var(--soft)}`;

function layout({ title, desc, canonical, body, ld }) {
  return `<!DOCTYPE html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonical}"><meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="${SITE}${canonical}"><meta property="og:locale" content="nb_NO">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${CSS}</style>
<script type="application/ld+json">${jsonld(ld)}</script></head><body>
<header><div class="wrap"><a class="logo" href="/">Fixvice</a><a href="/">Åpne Fixvice</a></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">Fixvice drives av Transform4Future Anna Madeleine Nordlund · Org.nr 924 590 734 · <a href="mailto:kontaktfixvice@gmail.com">kontaktfixvice@gmail.com</a><br><a href="/tjenester/">Alle tjenester og byer</a></div></footer>
</body></html>`;
}

function page(s, c) {
  const h1 = `${s.name} ${c.loc}`;
  const title = `${h1} – finn lokal ${s.what} | Fixvice`;
  const desc = `Finn ${s.what} ${c.loc}. Se tjenester, snakk direkte med den som tilbyr dem, og legg ut din egen på Fixvice. Dekker ${c.areas.slice(0, 3).join(', ')} og omegn.`;
  const canonical = url(s, c);
  const otherCities = cities.filter(x => x !== c);
  const otherServices = services.filter(x => x !== s);
  const faq = [...s.faq, [`Hvordan finner jeg ${s.what} ${c.loc} på Fixvice?`, `Åpne Fixvice, velg Norge og ${c.name}, og søk etter ${s.what}. Du skriver direkte til den som tilbyr tjenesten og avtaler pris og tidspunkt selv.`], [`Kan jeg tilby ${s.what.toLowerCase()} ${c.loc}?`, `Ja. Legg ut tjenesten din på Fixvice, velg ${c.name} som sted, og kunder kan kontakte deg direkte.`]];
  const body = `<nav class="crumb"><a href="/">Fixvice</a> › <a href="/tjenester/">Tjenester</a> › ${esc(h1)}</nav>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(s.intro)}</p>
<a class="cta" href="/">Søk etter ${esc(s.what)} ${esc(c.loc)}</a> <a class="cta alt" href="/">Legg ut din tjeneste</a>
<h2>Dette kan en ${esc(s.what)} hjelpe deg med</h2><ul>${s.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
<h2>${esc(s.name)} ${esc(c.loc)}</h2>
<p>${esc(c.blurb)} På Fixvice kan du finne ${esc(s.what)} som dekker blant annet ${esc(c.areas.join(', '))}.</p>
<div class="box"><strong>Tips før du bestiller</strong><ul>${s.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
<h2>Slik fungerer Fixvice</h2>
<ol><li>Søk etter tjenesten og velg ${esc(c.name)}.</li><li>Les om tilbyderen og send en melding.</li><li>Avtal pris, tid og detaljer direkte.</li></ol>
<h2>Vanlige spørsmål</h2>${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
<h2>Tilbyr du ${esc(s.what.toLowerCase())}?</h2><p>Legg ut tjenesten din på Fixvice og bli funnet av kunder ${esc(c.loc)}. Det tar noen minutter.</p><a class="cta" href="/">Legg ut tjenesten</a>
<h2>${esc(s.name)} i andre byer</h2><ul class="links">${otherCities.map(x => `<li><a href="${url(s, x)}">${esc(s.name)} ${esc(x.loc)}</a></li>`).join('')}</ul>
<h2>Andre tjenester ${esc(c.loc)}</h2><ul class="links">${otherServices.map(x => `<li><a href="${url(x, c)}">${esc(x.name)} ${esc(c.loc)}</a></li>`).join('')}</ul>`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Fixvice', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Tjenester', item: SITE + '/tjenester/' },
      { '@type': 'ListItem', position: 3, name: h1, item: SITE + canonical }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  return layout({ title, desc, canonical, body, ld });
}

function hub() {
  const body = `<nav class="crumb"><a href="/">Fixvice</a> › Tjenester</nav><h1>Tjenester i din by</h1>
<p class="lead">Finn lokale tjenester på Fixvice, eller legg ut din egen. Velg tjeneste og by.</p>
${services.map(s => `<h2>${esc(s.name)}</h2><ul class="links">${cities.map(c => `<li><a href="${url(s, c)}">${esc(s.name)} ${esc(c.loc)}</a></li>`).join('')}</ul>`).join('')}`;
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Tjenester i din by', url: SITE + '/tjenester/' };
  return layout({ title: 'Tjenester i din by – Fixvice', desc: 'Finn altmuligmann, maler, rengjøring, flyttehjelp og mer i Oslo, Oppegård, Ski, Asker, Bærum og flere byer på Fixvice.', canonical: '/tjenester/', body, ld });
}

const out = p => { fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };
fs.rmSync(path.join(ROOT, 'tjenester'), { recursive: true, force: true });
const urls = ['/tjenester/'];
fs.writeFileSync(out(path.join(ROOT, 'tjenester/index.html')), hub());
for (const s of services) for (const c of cities) {
  fs.writeFileSync(out(path.join(ROOT, url(s, c).slice(1), 'index.html')), page(s, c));
  urls.push(url(s, c));
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /tjenester/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(urls.length, 'sider');
