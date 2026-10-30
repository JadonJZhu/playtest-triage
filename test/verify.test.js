import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidShape, verify } from '../src/verify.js';

const rows = [{ id: 'a', text: 'queue is way too long' }, { id: 'b', text: 'fps drops in fights' }, { id: 'c', text: 'nice game' }];
const theme = (comments) => ({ name: 'T', summary: 'S', severity: 'low', comments });
const failureTypes = (output) => verify(output, rows).failures.map((f) => `${f.type}:${f.id}`);

test('correct output has no failures and every quote is verified', () => {
  const v = verify({ themes: [theme([{ id: 'a', quote: 'too long' }, { id: 'b', quote: 'fps drops' }])], unassigned: ['c'] }, rows);
  assert.deepEqual(v.failures, []);
  assert.equal(v.quotesVerified, 2);
  assert.equal(v.quotesTotal, 2);
});

test('catches an altered quote, including a change of case only, and an empty quote', () => {
  for (const quote of ['too long!', 'TOO LONG', '', '  ']) {
    const output = { themes: [theme([{ id: 'a', quote }, { id: 'b', quote: 'fps' }])], unassigned: ['c'] };
    assert.deepEqual(failureTypes(output), ['altered:a']);
  }
});

test('catches a missing id', () => {
  assert.deepEqual(failureTypes({ themes: [theme([{ id: 'a', quote: 'too long' }])], unassigned: ['c'] }), ['missing:b']);
});

test('catches a duplicated id, in a theme and across theme and unassigned', () => {
  const twice = { themes: [theme([{ id: 'a', quote: 'too long' }, { id: 'a', quote: 'queue' }, { id: 'b', quote: 'fps' }])], unassigned: ['c'] };
  assert.deepEqual(failureTypes(twice), ['duplicated:a']);
  const across = { themes: [theme([{ id: 'a', quote: 'too long' }, { id: 'b', quote: 'fps' }])], unassigned: ['c', 'a'] };
  assert.deepEqual(failureTypes(across), ['duplicated:a']);
});

test('catches an unknown id', () => {
  const output = { themes: [theme([{ id: 'a', quote: 'too long' }, { id: 'b', quote: 'fps' }, { id: 'z', quote: 'x' }])], unassigned: ['c'] };
  assert.deepEqual(failureTypes(output), ['unknown:z']);
});

test('failed items are kept and marked, never dropped', () => {
  const v = verify({ themes: [theme([{ id: 'a', quote: 'made up' }, { id: 'b', quote: 'fps' }])], unassigned: ['c'] }, rows);
  assert.equal(v.themes[0].comments.length, 2);
  assert.equal(v.themes[0].comments[0].verified, false);
  assert.equal(v.themes[0].comments[0].problem, 'altered');
  assert.equal(v.quotesVerified, 1);
});

test('isValidShape rejects output that breaks the schema', () => {
  assert.equal(isValidShape({ themes: [theme([{ id: 'a', quote: 'q' }])], unassigned: [] }), true);
  assert.equal(isValidShape({ themes: [] }), false);
  assert.equal(isValidShape(null), false);
  assert.equal(isValidShape({ themes: [{ ...theme([]), severity: 'huge' }], unassigned: [] }), false);
});
