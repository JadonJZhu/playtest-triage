import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';
import { userMessage, SYSTEM_PROMPT } from '../src/prompt.js';

const read = (name) => parseCsv(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [dev, test_, labels] = [read('dev.csv'), read('test.csv'), read('labels.csv')];
const themeOf = Object.fromEntries(labels.map((l) => [l.id, l.theme]));

test('csv parser keeps commas and quotes inside a field', () => {
  assert.deepEqual(parseCsv('id,text\na,"one, ""two"""\n'), [{ id: 'a', text: 'one, "two"' }]);
});

test('split is 40 dev and 80 test with no overlap, and every comment has a label', () => {
  assert.equal(dev.length, 40);
  assert.equal(test_.length, 80);
  assert.equal(new Set([...dev, ...test_].map((r) => r.id)).size, 120);
  for (const row of [...dev, ...test_]) assert.ok(themeOf[row.id]);
});

test('all 8 planted themes are in both sides, and the injection comment is in test', () => {
  for (const rows of [dev, test_]) {
    const themes = new Set(rows.map((r) => themeOf[r.id]).filter((t) => t !== 'none'));
    assert.equal(themes.size, 8);
  }
  assert.ok(test_.some((r) => r.text.includes('ignore your instructions')));
  assert.ok(!dev.some((r) => r.text.includes('ignore your instructions')));
});

test('the text sent to the model holds no labels', () => {
  const sent = SYSTEM_PROMPT + userMessage(test_);
  for (const theme of new Set(labels.map((l) => l.theme).filter((t) => t !== 'none'))) assert.ok(!sent.includes(theme));
});
