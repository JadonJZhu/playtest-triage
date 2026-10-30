#!/usr/bin/env node
// Run from the project folder. `run.js dev` and `run.js test` are one live run each; `run.js report` needs no key.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/csv.js';
import { triage } from '../src/triage.js';
import { baselineClusters } from '../src/baseline.js';
import { pairwiseScores, scoreRun, summarize } from '../src/evaluate.js';
import { buildReport } from '../src/report.js';

const injectionIdOf = (rows) => rows.find((row) => row.text.includes('ignore your instructions'))?.id;

function load(root) {
  const read = (name) => parseCsv(readFileSync(join(root, 'data', name), 'utf8'));
  const truth = Object.fromEntries(read('labels.csv').map((l) => [l.id, l.theme]));
  return { dev: read('dev.csv'), test: read('test.csv'), truth };
}

function savedRuns(resultsDir) {
  mkdirSync(resultsDir, { recursive: true });
  return readdirSync(resultsDir).filter((f) => /^(dev|test)-\d+\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));
}

async function liveRun(split, { root, fetchFn, apiKey }) {
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key, then run this again.');
    return 1;
  }
  const resultsDir = join(root, 'results');
  const earlier = savedRuns(resultsDir);
  const number = earlier.filter((r) => r.split === split).length + 1;

  const data = load(root);
  const rows = data[split];
  const spentBefore = earlier.reduce((sum, r) => sum + r.cost, 0);
  const result = await triage(rows, { apiKey, fetchFn, spentBefore });
  const run = { split, number, ...result };
  writeFileSync(join(resultsDir, `${split}-${number}.json`), JSON.stringify(run, null, 2) + '\n');

  const s = scoreRun(run, rows, data.truth, injectionIdOf(rows));
  console.log(`${s.name}: F1 ${s.f1.toFixed(3)}, precision ${s.precision.toFixed(3)}, recall ${s.recall.toFixed(3)}, ${s.themes} themes, quotes ${s.quotesVerified}/${s.quotesTotal}, `
    + `failures ${s.failures}, requests ${run.attempts.length}, tokens ${run.tokens}, cost $${run.cost.toFixed(5)}`);
  for (const a of run.attempts) if (a.error) console.error(`failed attempt: ${a.error}`);
  if (run.stopped) console.error(`stopped: ${run.stopped}`);
  return run.schemaValid && !run.stopped ? 0 : 1;
}

function report({ root }) {
  const resultsDir = join(root, 'results');
  const all = savedRuns(resultsDir);
  const testRuns = all.filter((r) => r.split === 'test');
  if (testRuns.length === 0) { console.error('No test runs in results/ yet. Run: npm run triage -- test'); return 1; }

  const { test, truth } = load(root);
  const baseline = pairwiseScores(test.map((row) => row.id), baselineClusters(test), truth);
  const scores = testRuns.map((run) => scoreRun(run, test, truth, injectionIdOf(test)));
  const summary = {
    model: testRuns[0].model,
    baseline,
    runs: scores,
    ...summarize(scores, baseline.f1),
    costTotal: all.reduce((sum, r) => sum + r.cost, 0),
  };
  writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  const medianRun = testRuns.find((r) => `test-${r.number}` === summary.medianRun);
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'index.html'), buildReport(summary, medianRun));
  console.log(`mean F1 ${summary.meanF1.toFixed(3)}, min ${summary.minF1.toFixed(3)}, baseline ${baseline.f1.toFixed(3)}, verified quotes ${(summary.verifiedShare * 100).toFixed(1)}%, total spend $${summary.costTotal.toFixed(4)}`);
  return 0;
}

export async function main(args, { root = process.cwd(), fetchFn = fetch, apiKey = process.env.OPENROUTER_API_KEY } = {}) {
  const command = args[0];
  if (command === 'dev' || command === 'test') return liveRun(command, { root, fetchFn, apiKey });
  if (command === 'report') return report({ root });
  console.error('Usage: bin/run.js dev | test | report');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
