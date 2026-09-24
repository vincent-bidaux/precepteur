/**
 * Leçons créées depuis l'espace parents + réglages de toutes les leçons.
 *
 *   GET    /api/lessons              → { lessons: [leçons créées], meta: { <id>: { children, status } } }
 *   POST   /api/lessons  { lesson, children }  → enregistre (brouillon), renvoie { lesson, meta, fixes, warnings }
 *   PUT    /api/lessons?id=  { children?, status? }  → modifie affectation / statut
 *   DELETE /api/lessons?id=          → supprime une leçon créée (pas une leçon intégrée)
 *
 * Stockage : "lessons/<id>" (contenu), "meta/lessons" (réglages de toutes
 * les leçons, écriture conditionnelle etag).
 */
import { CHILD_IDS } from "./children.js";
import { json } from "./log.js";
import { parentCodeOk } from "./auth.js";
import { LESSONS } from "../../src/lessons/index.js";
import { repairLesson, checkLesson } from "../../src/lib/lesson-check.js";

const META_KEY = "meta/lessons";
const STATUSES = ["brouillon", "publiee"];
const MAX_BYTES = 600_000;
const isBuiltin = (id) => LESSONS.some((l) => l.id === id);

export async function readMeta(store) {
  const cur = await store.getWithMetadata(META_KEY, { type: "json" });
  return cur?.data ?? {};
}

async function updateMeta(store, fn) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cur = await store.getWithMetadata(META_KEY, { type: "json" });
    const next = fn(structuredClone(cur?.data ?? {}));
    const res = cur ? await store.setJSON(META_KEY, next, { onlyIfMatch: cur.etag }) : await store.setJSON(META_KEY, next, { onlyIfNew: true });
    if (res?.modified !== false) return next;
    await new Promise((r) => setTimeout(r, Math.random() * 40 * (attempt + 1)));
  }
  throw new Error("conflict");
}

export async function readLessons(store) {
  const { blobs } = await store.list({ prefix: "lessons/" });
  const all = await Promise.all(blobs.map((b) => store.getWithMetadata(b.key, { type: "json" })));
  return all.map((x) => x?.data).filter(Boolean);
}

/** Une leçon (intégrée ou créée) par son id — utilisé aussi par la correction IA. */
export async function loadLesson(store, id) {
  const builtin = LESSONS.find((l) => l.id === id);
  if (builtin) return builtin;
  if (!store || typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id)) return null;
  return (await store.getWithMetadata(`lessons/${id}`, { type: "json" }))?.data ?? null;
}

const cleanChildren = (list) => (Array.isArray(list) ? [...new Set(list.filter((c) => CHILD_IDS.includes(c)))] : null);
const today = () => new Date().toISOString().slice(0, 10);

export async function handleLessons(req, store, { parentCode } = {}) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      const [lessons, meta] = await Promise.all([readLessons(store), readMeta(store)]);
      return json({ lessons, meta });
    }
    if (!parentCodeOk(req, parentCode)) return json({ error: "code_parent" }, 401);

    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: "trop_gros" }, 413);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "bad_request" }, 400);
      }
      const { lesson, fixes } = repairLesson(body?.lesson);
      const { errors, warnings } = checkLesson(lesson);
      if (errors.length) return json({ error: "lecon_invalide", errors, fixes }, 422);
      // identifiant unique (jamais celui d'une leçon existante)
      let finalId = lesson.id;
      for (let n = 2; isBuiltin(finalId) || (await store.getWithMetadata(`lessons/${finalId}`)); n++) finalId = `${lesson.id}-${n}`;
      const saved = { ...lesson, id: finalId, builtin: undefined, origin: "claude", addedAt: today(), createdAt: Date.now() };
      await store.setJSON(`lessons/${finalId}`, saved);
      const children = cleanChildren(body.children) ?? CHILD_IDS;
      const meta = await updateMeta(store, (m) => ({ ...m, [finalId]: { children, status: "brouillon" } }));
      return json({ lesson: saved, meta, fixes, warnings }, 201);
    }

    if (req.method === "PUT") {
      if (!id || !(await loadLesson(store, id))) return json({ error: "not_found" }, 404);
      const body = await req.json().catch(() => ({}));
      const patch = {};
      if (body.children !== undefined) {
        const c = cleanChildren(body.children);
        if (!c) return json({ error: "bad_children" }, 400);
        patch.children = c;
      }
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status)) return json({ error: "bad_status" }, 400);
        patch.status = body.status;
        // une leçon publiée apparaît en « Nouveau » à partir de ce jour
        if (body.status === "publiee" && !isBuiltin(id)) {
          const l = await loadLesson(store, id);
          await store.setJSON(`lessons/${id}`, { ...l, addedAt: today() });
        }
      }
      const meta = await updateMeta(store, (m) => ({ ...m, [id]: { ...m[id], ...patch } }));
      return json({ meta });
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "bad_request" }, 400);
      if (isBuiltin(id)) return json({ error: "lecon_integree" }, 400);
      await store.delete(`lessons/${id}`);
      const meta = await updateMeta(store, (m) => {
        delete m[id];
        return m;
      });
      return json({ meta });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    return json({ error: "server_error", detail: String(e?.message || e) }, 500);
  }
}
