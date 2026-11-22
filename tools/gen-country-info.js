// Writes currency + phone calling code for every country in COUNTRIES (index.html) into index.html and api/data.js.
// Run: NODE_PATH=/tmp/dat/node_modules node tools/gen-country-info.js
const fs = require('fs'), path = require('path');
const world = require('world-countries');
const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const names = [...html.matchAll(/^\s*\{name:"([^"]+)", flag:"[^"]+", lang:"[^"]+"\},/gm)].map(m => m[1]);
const ALIAS = { England: 'United Kingdom' };
const info = {}, all = new Set();
for (const n of names) {
  const w = world.find(x => x.name.common === (ALIAS[n] || n)) || world.find(x => x.name.official === (ALIAS[n] || n));
  if (!w) { console.error('NOT FOUND', n); continue; }
  const cur = Object.keys(w.currencies || {});
  const sfx = (w.idd && w.idd.suffixes) || [];
  const dial = (w.idd && w.idd.root || '') + (sfx.length === 1 ? sfx[0] : '');
  info[n] = { cur, dial }; cur.forEach(c => all.add(c));
}
const J = JSON.stringify;
const body = 'const COUNTRY_INFO = {\n' + Object.keys(info).sort().map(k => `  ${J(k)}: ${J(info[k])},`).join('\n') + '\n};\n' +
  'const CURRENCIES = ' + J([...all].sort()) + '; // every currency used by the supported countries\n';
const re = /\/\* GEN-INFO-START \*\/[\s\S]*?\/\* GEN-INFO-END \*\//;
const block = '/* GEN-INFO-START */\n' + body + '/* GEN-INFO-END */';
if (re.test(html)) html = html.replace(re, () => block);
else html = html.replace(/^const CURRENCIES = .*$/m, () => block);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
let d = fs.readFileSync(path.join(ROOT, 'api/data.js'), 'utf8');
d = d.replace(/^const CURRENCIES = .*$/m, () => 'const CURRENCIES = ' + J([...all].sort()) + ';');
fs.writeFileSync(path.join(ROOT, 'api/data.js'), d);
console.log(names.length, 'countries,', all.size, 'currencies');
