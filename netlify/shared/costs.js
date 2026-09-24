// Coûts IA engagés, pour l'espace parents.
//   "costs/ia" = { grading: { <leçon>: { <enfant>: { usd, n } } }, failed: usd }
// (le coût de création de chaque leçon est rangé dans la leçon elle-même)
const KEY = "costs/ia";

export async function readCosts(store) {
  return (await store.getWithMetadata(KEY, { type: "json" }))?.data ?? { grading: {}, failed: 0 };
}

async function update(store, fn) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cur = await store.getWithMetadata(KEY, { type: "json" });
    const next = fn(structuredClone(cur?.data ?? { grading: {}, failed: 0 }));
    const res = cur ? await store.setJSON(KEY, next, { onlyIfMatch: cur.etag }) : await store.setJSON(KEY, next, { onlyIfNew: true });
    if (res?.modified !== false) return next;
    await new Promise((r) => setTimeout(r, Math.random() * 40 * (attempt + 1)));
  }
}

export const addGradingCost = (store, lessonId, child, usd) =>
  update(store, (c) => {
    c.grading ||= {};
    const byChild = (c.grading[lessonId] ||= {});
    const cur = (byChild[child || "apercu"] ||= { usd: 0, n: 0 });
    cur.usd += usd;
    cur.n += 1;
    return c;
  });

/** Coût d'une création qui n'a pas abouti (refus, leçon illisible…) : payé quand même. */
export const addFailedCost = (store, usd) => update(store, (c) => ({ ...c, failed: (c.failed || 0) + usd }));
