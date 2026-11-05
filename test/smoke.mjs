// Opens docs/index.html from disk with the network off, fails on any console error, saves the screenshot.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const page_url = new URL('../docs/index.html', import.meta.url).href;
const installed = join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');

const browser = await chromium.launch({ executablePath: existsSync(installed) ? installed : undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true });
const page = await context.newPage();

const problems = [];
page.on('console', (msg) => { if (msg.type() === 'error') problems.push(msg.text()); });
page.on('pageerror', (err) => problems.push(err.message));
page.on('request', (req) => { if (!req.url().startsWith('file:')) problems.push(`network request: ${req.url()}`); });

await page.goto(page_url);

assert.deepEqual(problems, []);
assert.ok(await page.locator('.banner').innerText().then((t) => t === 'All comments about an invented game called Hollowgate.'));
assert.ok(await page.locator('.theme').count() > 0, 'themes are drawn');
assert.ok(await page.locator('#scores tr').count() >= 5, 'three runs and the baseline are in the table');
assert.ok((await page.locator('body').innerText()).includes('shared words, with no LLM'));

await page.screenshot({ path: fileURLToPath(new URL('../docs/screenshot.png', import.meta.url)) });
await browser.close();
console.log('smoke test passed');
