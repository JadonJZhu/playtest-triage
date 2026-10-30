import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baselineClusters, seededRandom, tfidfVectors } from '../src/baseline.js';
import { parseCsv } from '../src/csv.js';

const testRows = parseCsv(readFileSync(new URL('../data/test.csv', import.meta.url), 'utf8'));

test('same seed gives the same clusters', () => {
  assert.deepEqual(baselineClusters(testRows), baselineClusters(testRows));
});

test('uses exactly k clusters and covers every comment', () => {
  const clusters = baselineClusters(testRows);
  assert.equal(Object.keys(clusters).length, testRows.length);
  assert.equal(new Set(Object.values(clusters)).size, 8);
});

test('clearly separated comments land in different clusters', () => {
  const rows = [
    { id: 'a', text: 'queue wait queue wait' }, { id: 'b', text: 'queue wait long' },
    { id: 'c', text: 'stutter fps stutter' }, { id: 'd', text: 'fps stutter bad' },
  ];
  const c = baselineClusters(rows, 2);
  assert.equal(c.a, c.b);
  assert.equal(c.c, c.d);
  assert.notEqual(c.a, c.c);
});

test('vectors have unit length and the random generator repeats', () => {
  const [v] = tfidfVectors(['some words here', 'other words there']);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  assert.equal(seededRandom(7)(), seededRandom(7)());
});
