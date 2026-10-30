// Splits data/all.csv into data/dev.csv (40) and data/test.csv (80) with a fixed seed.
// The injection comment is forced into test. Throws if a planted theme is missing from either side.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';
import { seededRandom } from '../src/baseline.js';

const SEED = 42;
const quote = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows) => ['id,text', ...rows.map((r) => `${r.id},${quote(r.text)}`)].join('\n') + '\n';
const dataFile = (name) => new URL(`../data/${name}`, import.meta.url);

const all = parseCsv(readFileSync(dataFile('all.csv'), 'utf8'));
const labels = parseCsv(readFileSync(dataFile('labels.csv'), 'utf8'));
const themeOf = Object.fromEntries(labels.map((l) => [l.id, l.theme]));

const isInjection = (row) => row.text.includes('ignore your instructions');
const shuffled = all.filter((row) => !isInjection(row));
const random = seededRandom(SEED);
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const dev = shuffled.slice(0, 40);
const test = [...shuffled.slice(40), ...all.filter(isInjection)];

const planted = new Set(labels.map((l) => l.theme).filter((t) => t !== 'none'));
for (const [name, rows] of [['dev', dev], ['test', test]]) {
  const present = new Set(rows.map((row) => themeOf[row.id]));
  for (const theme of planted) if (!present.has(theme)) throw new Error(`${theme} missing from ${name}`);
}

writeFileSync(dataFile('dev.csv'), toCsv(dev));
writeFileSync(dataFile('test.csv'), toCsv(test));
console.log(`dev ${dev.length}, test ${test.length}`);
