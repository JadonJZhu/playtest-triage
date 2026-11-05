// Runs the whole pipeline in a temp folder with a mocked fetch, so nothing touches the network or results/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../bin/run.js';
import { parseCsv } from '../src/csv.js';

const PROJECT = fileURLToPath(new URL('..', import.meta.url));
const FAKE_KEY = 'not-a-real-key';

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'triage-'));
  cpSync(join(PROJECT, 'data'), join(root, 'data'), { recursive: true });
  return root;
}

const rowsOf = (root, split) => parseCsv(readFileSync(join(root, 'data', `${split}.csv`), 'utf8'));

// A perfect answer: comments grouped by their real label, each quote copied whole.
function perfectOutput(root, split) {
  const labels = parseCsv(readFileSync(join(root, 'data', 'labels.csv'), 'utf8'));
  const themeOf = Object.fromEntries(labels.map((l) => [l.id, l.theme]));
  const rows = rowsOf(root, split);
  const names = [...new Set(rows.map((r) => themeOf[r.id]))].filter((t) => t !== 'none');
  return {
    themes: names.map((name) => ({
      name, summary: 'A summary.', severity: 'medium',
      comments: rows.filter((r) => themeOf[r.id] === name).map((r) => ({ id: r.id, quote: r.text })),
    })),
    unassigned: rows.filter((r) => themeOf[r.id] === 'none').map((r) => r.id),
  };
}

function reply(content, { finish = 'stop', cost = 0.001 } = {}) {
  return new Response(JSON.stringify({
    model: 'mock', provider: 'MockProvider',
    choices: [{ finish_reason: finish, message: { content } }],
    usage: { total_tokens: 100, cost },
  }));
}

test('whole pipeline: live run, results file, summary and report, with no network', async () => {
  const root = tempRoot();
  const requests = [];
  const fetchFn = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return reply(JSON.stringify(perfectOutput(root, 'test')));
  };
  for (let i = 0; i < 3; i++) assert.equal(await main(['test'], { root, fetchFn, apiKey: FAKE_KEY }), 0);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].model, 'deepseek/deepseek-v4.1-flash');
  assert.equal(requests[0].response_format.json_schema.strict, true);
  assert.equal(requests[0].max_tokens, 16000);
  assert.deepEqual(requests[0].provider, { require_parameters: true });
  assert.deepEqual(requests[0].usage, { include: true });

  assert.equal(await main(['report'], { root }), 0);
  const summary = JSON.parse(readFileSync(join(root, 'results', 'summary.json'), 'utf8'));
  assert.equal(summary.meanF1, 1);
  assert.equal(summary.verifiedShare, 1);
  assert.deepEqual(summary.passLines, { f1: true, quotes: true, injection: true });
  assert.ok(summary.baseline.f1 > 0 && summary.baseline.f1 < 1);
  assert.equal(summary.runs[0].cost, 0.001);

  const html = readFileSync(join(root, 'docs', 'index.html'), 'utf8');
  assert.ok(html.includes('All comments about an invented game called Hollowgate.'));
  assert.ok(html.includes('deepseek/deepseek-v4.1-flash'));
  assert.equal(html.match(/<script/g).length, 1);

  const saved = readFileSync(join(root, 'results', 'test-1.json'), 'utf8');
  assert.ok(!saved.includes(FAKE_KEY));
});

test('a failed quote check gets one retry that lists the failures, then stays flagged', async () => {
  const root = tempRoot();
  const bad = perfectOutput(root, 'dev');
  bad.themes[0].comments[0].quote = 'words nobody wrote';
  const bodies = [];
  const fetchFn = async (_url, options) => { bodies.push(JSON.parse(options.body)); return reply(JSON.stringify(bad)); };
  assert.equal(await main(['dev'], { root, fetchFn, apiKey: FAKE_KEY }), 0);
  assert.equal(bodies.length, 2);
  assert.ok(bodies[1].messages.at(-1).content.includes('altered'));
  const run = JSON.parse(readFileSync(join(root, 'results', 'dev-1.json'), 'utf8'));
  assert.equal(run.verification.quotesVerified, run.verification.quotesTotal - 1);
  assert.equal(run.verification.themes[0].comments[0].verified, false);
});

test('HTTP errors, a bad finish_reason and invalid JSON each count as failed attempts', async () => {
  const replies = [
    [() => new Response('nope', { status: 500 }), () => reply('{not json')],
    [() => reply('{"themes":[],"unassigned":[]}', { finish: 'length' }), () => reply('{"wrong":1}')],
  ];
  for (const [first, second] of replies) {
    const root = tempRoot();
    let calls = 0;
    const fetchFn = async () => (++calls === 1 ? first() : second());
    assert.equal(await main(['dev'], { root, fetchFn, apiKey: FAKE_KEY }), 1);
    assert.equal(calls, 2);
    const run = JSON.parse(readFileSync(join(root, 'results', 'dev-1.json'), 'utf8'));
    assert.equal(run.schemaValid, false);
    assert.equal(run.verification.failures.length, 40);
  }
});

test('spend cap: no request is sent once reported cost reaches $1', async () => {
  const root = tempRoot();
  let calls = 0;
  const fetchFn = async () => { calls++; return reply(JSON.stringify(perfectOutput(root, 'dev')), { cost: 1 }); };
  assert.equal(await main(['dev'], { root, fetchFn, apiKey: FAKE_KEY }), 0);
  assert.equal(calls, 1);
  assert.equal(await main(['dev'], { root, fetchFn, apiKey: FAKE_KEY }), 1);
  assert.equal(calls, 1);
});

test('a completed request with no reported cost stops the run', async () => {
  const root = tempRoot();
  const fetchFn = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: '{"themes":[],"unassigned":[]}' } }], usage: {},
  }));
  assert.equal(await main(['dev'], { root, fetchFn, apiKey: FAKE_KEY }), 1);
});

// The real command line, in a folder with no .env and no key in the environment.
function runWithoutKey(root, ...args) {
  return spawnSync(process.execPath, ['--env-file-if-exists=.env', join(PROJECT, 'bin', 'run.js'), ...args], {
    cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH },
  });
}

test('without a key, a live run prints how to set one and exits 1', () => {
  const root = tempRoot();
  assert.ok(!existsSync(join(root, '.env')));
  const result = runWithoutKey(root, 'test');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPENROUTER_API_KEY is not set/);
});

test('without a key, the report still builds from saved results', async () => {
  const root = tempRoot();
  await main(['test'], { root, fetchFn: async () => reply(JSON.stringify(perfectOutput(root, 'test'))), apiKey: FAKE_KEY });
  const result = runWithoutKey(root, 'report');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('mean F1'));
});

test('the page escapes text that tries to close its script tag', async () => {
  const root = tempRoot();
  const output = perfectOutput(root, 'test');
  output.themes[0].summary = '</script><img src=x onerror=alert(1)>';
  const fetchFn = async () => reply(JSON.stringify(output));
  await main(['test'], { root, fetchFn, apiKey: FAKE_KEY });
  await main(['report'], { root });
  assert.ok(!readFileSync(join(root, 'docs', 'index.html'), 'utf8').includes('</script><img'));
});
