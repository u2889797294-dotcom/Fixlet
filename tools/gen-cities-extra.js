// Lager cities-extra.js: alle byer med minst 5000 innbyggere for landene i appen.
// Kjør: NODE_PATH=/tmp/dat/node_modules node tools/gen-cities-extra.js
const fs = require('fs'), path = require('path');
const cities = require('all-the-cities'), world = require('world-countries');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const names = html.match(/GEN-COUNTRIES-START \*\/([\s\S]*?)\/\* GEN-COUNTRIES-END/)[1].match(/name:"[^"]+"/g).map(x => x.slice(6, -1));
const EXIST = { Denmark: 'DK', Finland: 'FI', Iceland: 'IS', Norway: 'NO', Sweden: 'SE' };
const MIN = 5000;
const out = {};
const byCca2 = {};
for (const c of cities) if (c.population >= MIN) (byCca2[c.country] ||= []).push(c);
const add = (country, cc2, onlyExisting) => {
  const list = (byCca2[cc2] || []).sort((a, b) => b.population - a.population);
  const seen = new Set(), arr = [];
  for (const c of list) {
    const n = c.name.trim(); const k = n.toLowerCase();
    if (!n || seen.has(k)) continue; seen.add(k);
    arr.push([n, +c.loc.coordinates[1].toFixed(2), +c.loc.coordinates[0].toFixed(2)]);
  }
  out[country] = { only: !!onlyExisting, c: arr };
};
for (const n of names) { const w = world.find(x => x.name.common === n); if (w && byCca2[w.cca2]) add(n, w.cca2, false); }
for (const [n, cc2] of Object.entries(EXIST)) add(n, cc2, true);
const js = '/* Generert av tools/gen-cities-extra.js: byer med minst ' + MIN + ' innbyggere (GeoNames). [navn, breddegrad, lengdegrad] */\nwindow.CITIES_EXTRA=' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(ROOT, 'cities-extra.js'), js);
console.log(Object.keys(out).length, 'land', Object.values(out).reduce((s, x) => s + x.c.length, 0), 'byer', (js.length / 1024 | 0) + ' KB');
