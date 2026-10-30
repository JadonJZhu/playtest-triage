// The comparison with no LLM: TF-IDF vectors plus k-means, written by hand with no dependency.

const STOPWORDS = new Set(`a an and are as at be but by for from has have i im in is it its me my of on or
so that the their them then there they this to u was we were what when with you your`.split(/\s+/));

// mulberry32: a small seeded random number generator, so every run gives the same result.
export function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((word) => !STOPWORDS.has(word));
}

// One unit-length vector per text.
export function tfidfVectors(texts) {
  const docs = texts.map(tokenize);
  const docCount = new Map();
  for (const doc of docs) for (const word of new Set(doc)) docCount.set(word, (docCount.get(word) || 0) + 1);
  const index = new Map([...docCount.keys()].sort().map((word, i) => [word, i]));
  return docs.map((doc) => {
    const vector = new Array(index.size).fill(0);
    for (const word of doc) vector[index.get(word)] += Math.log(docs.length / docCount.get(word)) + 1;
    const length = Math.hypot(...vector) || 1;
    return vector.map((x) => x / length);
  });
}

const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

function kmeansOnce(vectors, k, random) {
  const picks = new Set();
  while (picks.size < k) picks.add(Math.floor(random() * vectors.length));
  let centers = [...picks].map((i) => vectors[i]);
  let assignment = [];
  for (let iteration = 0; iteration < 50; iteration++) {
    const next = vectors.map((v) => {
      const scores = centers.map((c) => dot(v, c));
      return scores.indexOf(Math.max(...scores));
    });
    if (next.join() === assignment.join()) break;
    assignment = next;
    centers = centers.map((center, c) => {
      const members = vectors.filter((_, i) => assignment[i] === c);
      if (members.length === 0) return center;
      return center.map((_, d) => members.reduce((sum, m) => sum + m[d], 0) / members.length);
    });
  }
  const fit = vectors.reduce((sum, v, i) => sum + dot(v, centers[assignment[i]]), 0);
  return { assignment, fit };
}

// Returns { id: clusterNumber }. Keeps the best of 10 random starts.
export function baselineClusters(rows, k = 8, seed = 42) {
  const vectors = tfidfVectors(rows.map((row) => row.text));
  const random = seededRandom(seed);
  let best = null;
  for (let start = 0; start < 10; start++) {
    const result = kmeansOnce(vectors, k, random);
    if (!best || result.fit > best.fit) best = result;
  }
  return Object.fromEntries(rows.map((row, i) => [row.id, best.assignment[i]]));
}
