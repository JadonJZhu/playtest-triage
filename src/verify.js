// Pure checks on the model's output. Nothing is dropped: failures are marked and listed.

const SEVERITIES = ['low', 'medium', 'high'];
const isString = (x) => typeof x === 'string';

export function isValidShape(output) {
  return Array.isArray(output?.themes) && Array.isArray(output?.unassigned) && output.unassigned.every(isString)
    && output.themes.every((t) => isString(t.name) && isString(t.summary) && SEVERITIES.includes(t.severity)
      && Array.isArray(t.comments) && t.comments.every((c) => isString(c.id) && isString(c.quote)));
}

// Returns the themes with each comment marked verified or not, plus a list of every failure.
export function verify(output, rows) {
  const textOf = new Map(rows.map((row) => [row.id, row.text]));
  const seen = new Set();
  const failures = [];
  const fail = (type, id) => { failures.push({ type, id }); return type; };

  // Ids must be known and appear once. Returns the failure type, or null if the id is fine.
  const checkId = (id) => {
    if (!textOf.has(id)) return fail('unknown', id);
    if (seen.has(id)) return fail('duplicated', id);
    seen.add(id);
    return null;
  };

  const themes = output.themes.map((theme) => ({
    ...theme,
    comments: theme.comments.map(({ id, quote }) => {
      let problem = checkId(id);
      if (!problem && (!quote.trim() || !textOf.get(id).includes(quote))) problem = fail('altered', id);
      return { id, quote, verified: !problem, problem };
    }),
  }));
  output.unassigned.forEach(checkId);
  for (const row of rows) if (!seen.has(row.id)) fail('missing', row.id);

  const quotes = themes.flatMap((theme) => theme.comments);
  return {
    themes,
    unassigned: output.unassigned,
    failures,
    quotesTotal: quotes.length,
    quotesVerified: quotes.filter((c) => c.verified).length,
  };
}
