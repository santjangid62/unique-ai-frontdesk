import KnowledgeEntry from '../models/KnowledgeEntry.js';

const STOPWORDS = new Set(
  `a an the and or but if of to in on for with is are was were be been being do does did doing i you we they
   he she it my your our their me us them this that these those how what when where who why can could should would
   will shall may might must have has had not no yes please tell give about from at as by into than then there here
   want need like know also very just some any all more most much many kya hai hain ka ki ke ko mein mujhe aap`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Tenant-scoped semantic-ish retrieval. Entries are scored with phrase, title,
 * tag and content overlap so grounded answers stay cheap and deterministic.
 * Retrieval never crosses tenant boundaries.
 */
export async function retrieveKnowledge(tenantId, query, { limit = 6 } = {}) {
  const entries = await KnowledgeEntry.find({ tenantId, isEnabled: true })
    .select('title content category tags version')
    .limit(400)
    .lean();

  if (!entries.length) return [];

  const queryTokens = tokenize(query);
  const phrase = String(query || '').toLowerCase().trim();

  const scored = entries.map((entry) => {
    const titleTokens = new Set(tokenize(entry.title));
    const tagTokens = new Set(tokenize((entry.tags || []).join(' ')));
    const contentTokens = new Set(tokenize(entry.content));
    let score = 0;

    for (const token of queryTokens) {
      if (titleTokens.has(token)) score += 4;
      if (tagTokens.has(token)) score += 3;
      if (contentTokens.has(token)) score += 1;
    }
    if (phrase.length > 3 && entry.content.toLowerCase().includes(phrase)) score += 6;
    if (phrase.length > 3 && entry.title.toLowerCase().includes(phrase)) score += 5;
    if (entry.category === 'business') score += 0.5;

    return { entry, score };
  });

  const matches = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  const picked = (matches.length ? matches : scored.sort((a, b) => b.score - a.score)).slice(0, limit);

  return picked.map(({ entry, score }) => ({
    id: String(entry._id),
    title: entry.title,
    category: entry.category,
    content: entry.content,
    version: entry.version,
    score: Number(score.toFixed(2)),
  }));
}

/** Builds the compact grounded context block given to the model. */
export function formatKnowledge(knowledge) {
  if (!knowledge.length) return 'No verified knowledge entries matched this query.';
  return knowledge
    .map((item, index) => `[${index + 1}] (${item.category}) ${item.title}\n${item.content}`)
    .join('\n\n');
}
