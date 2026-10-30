// One triage run: one request to OpenRouter plus at most one retry, then verification.
import { SYSTEM_PROMPT, userMessage } from './prompt.js';
import { isValidShape, verify } from './verify.js';

export const MODEL = 'deepseek/deepseek-v4.1-flash';
export const SPEND_CAP = 1; // US dollars, summed from the cost OpenRouter reports.
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const strictObject = (properties) => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});
const SCHEMA = strictObject({
  themes: {
    type: 'array',
    items: strictObject({
      name: { type: 'string' }, summary: { type: 'string' },
      severity: { type: 'string', enum: ['low', 'medium', 'high'] },
      comments: { type: 'array', items: strictObject({ id: { type: 'string' }, quote: { type: 'string' } }) },
    }),
  },
  unassigned: { type: 'array', items: { type: 'string' } },
});

// Sends one request. Returns a record of it; `error` is set if this counts as a failed attempt.
async function sendRequest(messages, apiKey, fetchFn) {
  const attempt = { error: null, finishReason: null, model: null, provider: null, tokens: null, cost: null, response: null, output: null };
  try {
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10 * 60 * 1000),
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 16000,
        response_format: { type: 'json_schema', json_schema: { name: 'triage', strict: true, schema: SCHEMA } },
        provider: { require_parameters: true },
        usage: { include: true },
      }),
    });
    const text = await res.text();
    if (!res.ok) { attempt.response = text; attempt.error = `HTTP ${res.status}`; return attempt; }
    attempt.response = text; // kept as text in case it is not JSON
    const body = JSON.parse(text);
    attempt.response = body;
    attempt.model = body.model;
    attempt.provider = body.provider;
    attempt.tokens = body.usage?.total_tokens ?? null;
    attempt.cost = body.usage?.cost ?? null;
    attempt.finishReason = body.choices?.[0]?.finish_reason ?? null;
    if (attempt.finishReason !== 'stop') { attempt.error = `finish_reason ${attempt.finishReason}`; return attempt; }
    const output = JSON.parse(body.choices[0].message.content);
    if (!isValidShape(output)) { attempt.error = 'output does not match the schema'; return attempt; }
    attempt.output = output;
  } catch (err) {
    attempt.error = `${err.name}: ${err.message}`;
  }
  return attempt;
}

// spentBefore: dollars already spent by earlier runs. Returns everything needed for the results file.
export async function triage(rows, { apiKey, fetchFn = fetch, spentBefore = 0 }) {
  const attempts = [];
  const firstMessages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(rows) }];
  let messages = firstMessages;
  let output = null;
  let verification = null;
  let stopped = null;

  for (let i = 0; i < 2; i++) {
    const spent = spentBefore + attempts.reduce((sum, a) => sum + (a.cost || 0), 0);
    if (spent >= SPEND_CAP) { stopped = `spend cap reached: $${spent.toFixed(4)}`; break; }

    const attempt = await sendRequest(messages, apiKey, fetchFn);
    attempts.push(attempt);
    // The cap cannot be enforced without a reported cost, so a completed request with none stops the run.
    if (attempt.response?.choices && typeof attempt.cost !== 'number') { stopped = 'OpenRouter reported no cost'; break; }

    if (attempt.output) {
      output = attempt.output;
      verification = verify(output, rows);
      if (verification.failures.length === 0) break;
      const list = verification.failures.map((f) => `${f.id}: ${f.type}`).join('\n');
      messages = [...firstMessages, { role: 'assistant', content: JSON.stringify(output) },
        { role: 'user', content: `These checks failed. Return the full corrected JSON.\n${list}` }];
    }
  }

  return {
    model: MODEL,
    attempts,
    output,
    schemaValid: output !== null,
    verification: verification ?? verify({ themes: [], unassigned: [] }, rows),
    tokens: attempts.reduce((sum, a) => sum + (a.tokens || 0), 0),
    cost: attempts.reduce((sum, a) => sum + (a.cost || 0), 0),
    stopped,
  };
}
