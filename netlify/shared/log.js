/**
 * Journal d'activité : tentatives de séries d'exercices + visites.
 *
 *   GET  /api/log              → { records } de tous les enfants
 *   GET  /api/log?child=livia   → { records } d'un enfant
 *   POST /api/log  { records }  → ajoute (dédoublonné par id), renvoie { saved }
 *
 * Stockage : un blob par enfant et par mois, clé "log/<enfant>/<AAAA-MM>",
 * contenu { records: [...] }. Écriture conditionnelle (etag) + nouvelles
 * tentatives, pour ne rien perdre si deux appareils écrivent en même temps.
 */
import { CHILD_IDS } from "./children.js";

const MAX_RECORDS_PER_POST = 200;
const MAX_TEXT = 2000;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function cleanAnswer(a = {}) {
  return {
    qid: str(a.qid, 80),
    score: num(a.score),
    max: num(a.max),
    given: typeof a.given === "string" ? a.given.slice(0, MAX_TEXT) : a.given === undefined ? undefined : JSON.stringify(a.given).slice(0, MAX_TEXT),
    hint: a.hint === true || undefined,
    timeMs: num(a.timeMs),
    self: str(a.self, 20),
    ai: str(a.ai, MAX_TEXT),
  };
}

/** Ne garde que la forme attendue ; renvoie null si l'enregistrement est invalide. */
export function cleanRecord(r) {
  if (!r || typeof r !== "object") return null;
  if (!CHILD_IDS.includes(r.child)) return null;
  if (typeof r.id !== "string" || !/^[\w-]{6,64}$/.test(r.id)) return null;
  const ts = num(r.ts);
  if (!ts) return null;
  const base = { id: r.id, child: r.child, ts, device: str(r.device, 40) };
  if (r.type === "attempt") {
    return {
      ...base,
      type: "attempt",
      lessonId: str(r.lessonId, 80),
      seriesId: str(r.seriesId, 80),
      mode: str(r.mode, 20),
      durationMs: num(r.durationMs),
      score: num(r.score),
      max: num(r.max),
      note20: num(r.note20),
      answers: Array.isArray(r.answers) ? r.answers.slice(0, 100).map(cleanAnswer) : [],
    };
  }
  if (r.type === "visit") {
    return {
      ...base,
      type: "visit",
      page: str(r.page, 40),
      lessonId: str(r.lessonId, 80),
      durationMs: num(r.durationMs),
    };
  }
  return null;
}

const monthKey = (child, ts) => `log/${child}/${new Date(ts).toISOString().slice(0, 7)}`;

async function appendTo(store, key, records) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    const existing = current?.data?.records ?? [];
    const known = new Set(existing.map((r) => r.id));
    const fresh = records.filter((r) => !known.has(r.id));
    if (fresh.length === 0) return 0;
    const next = { records: [...existing, ...fresh] };
    const res = current
      ? await store.setJSON(key, next, { onlyIfMatch: current.etag })
      : await store.setJSON(key, next, { onlyIfNew: true });
    if (res?.modified !== false) return fresh.length;
    // attente aléatoire croissante pour désynchroniser les écrivains concurrents
    await new Promise((r) => setTimeout(r, Math.random() * 40 * (attempt + 1)));
  }
  throw new Error("conflict");
}

export async function readRecords(store, child) {
  const prefixes = child ? [`log/${child}/`] : CHILD_IDS.map((c) => `log/${c}/`);
  const keys = [];
  for (const prefix of prefixes) {
    const { blobs } = await store.list({ prefix });
    keys.push(...blobs.map((b) => b.key));
  }
  const parts = await Promise.all(keys.map((k) => store.getWithMetadata(k, { type: "json" })));
  return parts.flatMap((p) => p?.data?.records ?? []).sort((a, b) => a.ts - b.ts);
}

export async function handleLog(req, store) {
  try {
    if (req.method === "GET") {
      const child = new URL(req.url).searchParams.get("child");
      if (child && !CHILD_IDS.includes(child)) return json({ error: "unknown_child" }, 400);
      return json({ records: await readRecords(store, child) });
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.records)) return json({ error: "bad_request" }, 400);
      const clean = body.records.slice(0, MAX_RECORDS_PER_POST).map(cleanRecord).filter(Boolean);
      const groups = new Map();
      for (const r of clean) {
        const k = monthKey(r.child, r.ts);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
      }
      let saved = 0;
      for (const [k, recs] of groups) saved += await appendTo(store, k, recs);
      // accepted = ids que le client peut retirer de sa file d'attente
      return json({ saved, accepted: clean.map((r) => r.id) });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ error: "server_error", detail: String(e?.message || e) }, 500);
  }
}
