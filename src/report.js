// Builds docs/index.html: one self-contained page. The data is embedded as JSON and drawn by an inline script.

const STYLE = `
body { margin: 0; padding: 20px 28px; background: #0F1923; color: #ECE8E1; font: 14px/1.4 system-ui, sans-serif; }
h1 { margin: 0 0 4px; font-size: 24px; }
h2 { margin: 18px 0 8px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #FF4655; }
h3 { margin: 0 0 4px; font-size: 15px; }
p { margin: 0 0 8px; }
.banner { border: 1px solid #F5B841; color: #F5B841; padding: 8px 12px; margin: 10px 0; }
.top { display: grid; grid-template-columns: 3fr 2fr; gap: 28px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
td { padding: 3px 8px; border-bottom: 1px solid #33414e; }
#scores tr:first-child td { font-weight: 600; opacity: .75; }
.pass { color: #3DDC97; font-weight: 600; }
.fail { color: #FF4655; font-weight: 600; }
.themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 10px; }
.theme { border: 1px solid #33414e; border-left: 3px solid #FF4655; padding: 8px 12px; }
.meta { font-size: 12px; opacity: .75; margin-left: 6px; font-weight: 400; }
ul { margin: 6px 0 0; padding: 0; list-style: none; font-size: 13px; }
.id { opacity: .55; margin-right: 6px; font-size: 12px; }
.flag { color: #F5B841; font-weight: 600; margin-right: 6px; font-size: 12px; }
`;

// Runs in the browser. append() treats strings as plain text, so comment and model text cannot inject HTML.
const SCRIPT = `
const el = (tag, className, ...children) => {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...children);
  return node;
};
const num = (x) => x.toFixed(3);
const verdict = (ok) => el('td', ok ? 'pass' : 'fail', ok ? 'pass' : 'fail');
const row = (...cells) => el('tr', '', ...cells.map((c) => (c instanceof Node ? c : el('td', '', String(c)))));
const { summary: s, themes, failures, unassigned } = REPORT;

document.getElementById('scores').append(
  row('', 'F1', 'Precision', 'Recall', 'Verified quotes', 'Requests', 'Tokens', 'Cost (USD)', 'Injection'),
  ...s.runs.map((r) => row(r.name, num(r.f1), num(r.precision), num(r.recall), r.quotesVerified + '/' + r.quotesTotal,
    r.requests, r.tokens, r.cost.toFixed(5), verdict(r.injection.pass))),
  row('Baseline', num(s.baseline.f1), num(s.baseline.precision), num(s.baseline.recall), '', '', '', '', ''),
);
document.getElementById('lines').append(
  row('Mean F1 at least 0.75 and above the baseline', num(s.meanF1) + ' (min ' + num(s.minF1) + '), baseline ' + num(s.baseline.f1), verdict(s.passLines.f1)),
  row('Verified quotes at least 95%', (s.verifiedShare * 100).toFixed(1) + '%', verdict(s.passLines.quotes)),
  row('Injection comment: valid output, id exactly once', s.runs.map((r) => r.injection.placedIn).join('; '), verdict(s.passLines.injection)),
);
document.getElementById('themes').append(...themes.map((t) => el('div', 'theme',
  el('h3', '', t.name, el('span', 'meta', t.comments.length + ' comments, ' + t.severity + ' severity')),
  el('p', '', t.summary),
  el('ul', '', ...t.comments.map((c) => el('li', '', el('span', 'id', c.id),
    c.verified ? '' : el('span', 'flag', 'UNVERIFIED (' + c.problem + ')'), c.quote))),
)));
document.getElementById('unassigned').textContent = 'In no theme (' + unassigned.length + '): ' + unassigned.join(', ');
if (failures.length) document.getElementById('failures').textContent = 'UNVERIFIED: ' + failures.map((f) => f.id + ' (' + f.type + ')').join(', ');
`;

export function buildReport(summary, medianRun) {
  const { themes, unassigned, failures } = medianRun.verification;
  const ranked = [...themes].sort((a, b) => b.comments.length - a.comments.length);
  // "<" is escaped so that no comment or model text can close the script tag.
  const json = JSON.stringify({ summary, themes: ranked, unassigned, failures }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playtest Triage</title>
<style>${STYLE}</style></head>
<body>
<h1>Playtest Triage</h1>
<p>Playtest comments sorted into ranked themes. Code checks that every quote below exists in the source comment.</p>
<div class="banner"><strong>Invented data.</strong> All comments are invented, about an invented game called Hollowgate. Their themes were planted on purpose, and that makes this task easier than real player feedback.</div>
<div class="top">
<div><h2>Evaluation on the 80 test comments</h2><table id="scores"></table>
<h2>Pass lines, fixed before the test runs</h2><table id="lines"></table></div>
<div><h2>How this works</h2><p>One request sends the comments to ${summary.model}, a model with open weights, through OpenRouter. Code then checks that each quote is an exact substring of its comment and that each id appears exactly once. A failed check gets one retry, and anything still failing is flagged. F1 compares each pair of comments: did the system and the hand labels agree they belong together? The baseline is TF-IDF plus k-means with k = 8, the simple option that needs no LLM.</p></div>
</div>
<h2>Themes from ${summary.medianRun}, the median-F1 run, ranked by count</h2>
<div class="themes" id="themes"></div>
<p id="unassigned" style="margin-top:10px"></p>
<p id="failures" class="flag"></p>
<script>
const REPORT = ${json};
${SCRIPT}</script>
</body>
</html>
`;
}
