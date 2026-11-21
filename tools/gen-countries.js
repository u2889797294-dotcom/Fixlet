// Bygger landlisten (150 land) og bylister. Krever: npm i world-countries all-the-cities (i en midlertidig mappe)
// Kjør: NODE_PATH=/tmp/dat/node_modules node tools/gen-countries.js
const fs = require('fs'), path = require('path');
const cities = require('all-the-cities'), world = require('world-countries');
const ROOT = path.join(__dirname, '..');
const EXISTING = ['Denmark', 'England', 'Finland', 'Iceland', 'Norway', 'Sweden'];
const SKIP_CCA2 = new Set(['GB', 'NO', 'SE', 'DK', 'FI', 'IS']);
const L3 = { nld:'nl', deu:'de', fra:'fr', spa:'es', por:'pt', ita:'it', rus:'ru', ara:'ar', aze:'az', bel:'be', bul:'bg', ben:'bn', bos:'bs', cat:'ca', ces:'cs', ell:'el', est:'et', fas:'fa', heb:'he', hrv:'hr', hun:'hu', hye:'hy', ind:'id', jpn:'ja', kat:'ka', khm:'km', kor:'ko', lao:'lo', lit:'lt', lav:'lv', mkd:'mk', mon:'mn', msa:'ms', mya:'my', nep:'ne', pol:'pl', ron:'ro', slk:'sk', slv:'sl', sqi:'sq', srp:'sr', tha:'th', tur:'tr', ukr:'uk', urd:'ur', vie:'vi', zho:'zh', swe:'sv', dan:'da', fin:'fi', isl:'is', nor:'no', nob:'no', nno:'no' };

const byCountry = {};
for (const c of cities) (byCountry[c.country] ||= []).push(c);
const pop = {};
for (const k in byCountry) pop[k] = byCountry[k].reduce((s, c) => s + (c.population || 0), 0);

const pick = world.filter(w => w.independent && !SKIP_CCA2.has(w.cca2) && byCountry[w.cca2])
  .sort((a, b) => pop[b.cca2] - pop[a.cca2]).slice(0, 144);

const countries = [], citiesOut = {}, coords = {};
for (const w of pick) {
  const name = w.name.common;
  const langs = Object.keys(w.languages || {}).map(k => L3[k]).filter(Boolean);
  countries.push({ name, flag: w.flag, lang: langs[0] || 'en' });
  const list = byCountry[w.cca2].filter(c => c.population > 0).sort((a, b) => b.population - a.population);
  const seen = new Set(), names = [];
  for (const c of list) { const n = c.name.trim(); if (!n || seen.has(n.toLowerCase())) continue; seen.add(n.toLowerCase()); names.push([n, c.loc.coordinates]); if (names.length >= 25) break; }
  citiesOut[name] = names.map(x => x[0]);
  coords[name] = Object.fromEntries(names.slice(0, 8).map(([n, [lon, lat]]) => [n, [+lat.toFixed(2), +lon.toFixed(2)]]));
}
const J = JSON.stringify;
const countriesJs = countries.sort((a, b) => a.name.localeCompare(b.name)).map(c => `  {name:${J(c.name)}, flag:${J(c.flag)}, lang:${J(c.lang)}},`).join('\n');
const citiesJs = Object.keys(citiesOut).sort().map(k => `  ${J(k)}: ${J(citiesOut[k])},`).join('\n');
const coordsJs = Object.keys(coords).sort().map(k => `  ${J(k)}: ${J(coords[k])},`).join('\n');

let t = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sub = (start, end, body) => {
  const re = new RegExp(`/\\* ${start} \\*/[\\s\\S]*?/\\* ${end} \\*/`);
  const block = `/* ${start} */\n${body}\n/* ${end} */`;
  if (re.test(t)) t = t.replace(re, () => block); return block;
};
if (!t.includes('/* GEN-COUNTRIES-START */')) {
  t = t.replace('  {name:"Sweden", flag:"🇸🇪", lang:"sv"},\n', m => m + '/* GEN-COUNTRIES-START */\n/* GEN-COUNTRIES-END */\n');
  t = t.replace(/(  "Sweden": \["Stockholm"[^\n]*\n)/, m => m + '/* GEN-CITIES-START */\n/* GEN-CITIES-END */\n');
  t = t.replace('const CITY_COORDS = {\n', m => m + '/* GEN-COORDS-START */\n/* GEN-COORDS-END */\n');
}
sub('GEN-COUNTRIES-START', 'GEN-COUNTRIES-END', countriesJs);
sub('GEN-CITIES-START', 'GEN-CITIES-END', citiesJs);
sub('GEN-COORDS-START', 'GEN-COORDS-END', coordsJs);
fs.writeFileSync(path.join(ROOT, 'index.html'), t);

const all = [...EXISTING, ...countries.map(c => c.name)];
let d = fs.readFileSync(path.join(ROOT, 'api/data.js'), 'utf8');
d = d.replace(/const COUNTRIES = \[[^\]]*\];/, 'const COUNTRIES = ' + J(all) + ';');
fs.writeFileSync(path.join(ROOT, 'api/data.js'), d);
console.log(countries.length + EXISTING.length, 'land');
