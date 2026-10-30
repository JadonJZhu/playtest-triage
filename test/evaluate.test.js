import test from 'node:test';
import assert from 'node:assert/strict';
import { pairwiseScores, summarize } from '../src/evaluate.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test('identical grouping scores 1', () => {
  const s = pairwiseScores(['a', 'b', 'c'], { a: 1, b: 1, c: 2 }, { a: 'x', b: 'x', c: 'y' });
  assert.deepEqual(s, { precision: 1, recall: 1, f1: 1 });
});

test('hand-computed: 3 predicted pairs, 2 true pairs, 1 shared', () => {
  // Predicted pairs ab, ac, bc. True pairs ab, cd. Shared: ab. Precision 1/3, recall 1/2, F1 2/5.
  const s = pairwiseScores(['a', 'b', 'c', 'd'], { a: 1, b: 1, c: 1 }, { a: 'x', b: 'x', c: 'y', d: 'y' });
  close(s.precision, 1 / 3);
  close(s.recall, 1 / 2);
  close(s.f1, 2 / 5);
});

test('comments labelled none are singletons, so grouping two of them is a false pair', () => {
  // Predicted pairs ab, cd. True pairs: ab only. Precision 1/2, recall 1, F1 2/3.
  const s = pairwiseScores(['a', 'b', 'c', 'd'], { a: 1, b: 1, c: 2, d: 2 }, { a: 'x', b: 'x', c: 'none', d: 'none' });
  close(s.precision, 1 / 2);
  close(s.recall, 1);
  close(s.f1, 2 / 3);
});

test('unassigned comments are singletons, so nothing grouped scores 0', () => {
  assert.deepEqual(pairwiseScores(['a', 'b'], {}, { a: 'x', b: 'x' }), { precision: 0, recall: 0, f1: 0 });
});

test('summarize picks the median run and applies the pass lines', () => {
  const run = (name, f1, verified) => ({ name, f1, quotesVerified: verified, quotesTotal: 100, injection: { pass: true } });
  const s = summarize([run('test-1', 0.9, 100), run('test-2', 0.7, 90), run('test-3', 0.8, 95)], 0.5);
  assert.equal(s.medianRun, 'test-3');
  close(s.meanF1, 0.8);
  close(s.minF1, 0.7);
  close(s.verifiedShare, 0.95);
  assert.deepEqual(s.passLines, { f1: true, quotes: true, injection: true });
  const belowBaseline = summarize([run('test-1', 0.8, 100)], 0.85);
  assert.equal(belowBaseline.passLines.f1, false);
});
