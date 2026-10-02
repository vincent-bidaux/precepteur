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
import { readCosts } from "./costs.js";
import { levelOf } from "../../src/data/subjects.js";
import { LESSONS } from "../../src/lessons/index.js";
import { repairLesson, checkLesson } from "../../src/lib/lesson-check.js";

const META_KEY = "meta/lessons";
const CHILDREN_KEY = "settings/children";
const MAX_REQUESTS = 50;
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

async function readJSON(store, key, fallback) {
  return (await store.getWithMetadata(key, { type: "json" }))?.data ?? fallback;
}

async function readRequests(store) {
  const { blobs } = await store.list({ prefix: "requests/" });
  const all = await Promise.all(blobs.map((b) => store.getWithMetadata(b.key, { type: "json" })));
  return all.map((x) => x?.data).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
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

/** Correction IA des réponses libres active pour cette leçon ? (réglage parent, sinon valeur de la leçon, sinon oui) */
export async function aiGradingOn(store, lesson) {
  const meta = await readMeta(store);
  return meta[lesson.id]?.aiGrading ?? lesson.aiGrading ?? true;
}

const cleanChildren = (list) => (Array.isArray(list) ? [...new Set(list.filter((c) => CHILD_IDS.includes(c)))] : null);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Vérifie, répare et enregistre une nouvelle leçon en brouillon.
 * → { lesson, meta, fixes, warnings } ou { errors, fixes } si inutilisable.
 */
export async function saveNewLesson(store, input, children, extra = {}, { aiGrading = true } = {}) {
  const { lesson, fixes } = repairLesson(input);
  const { errors, warnings } = checkLesson(lesson);
  if (errors.length) return { errors, fixes };
  // identifiant unique (jamais celui d'une leçon existante)
  let finalId = lesson.id;
  for (let n = 2; isBuiltin(finalId) || (await store.getWithMetadata(`lessons/${finalId}`)); n++) finalId = `${lesson.id}-${n}`;
  const saved = { ...lesson, ...extra, id: finalId, builtin: undefined, origin: "claude", addedAt: today(), createdAt: Date.now(), checkNotes: [...fixes.map((f) => `🔧 ${f}`), ...warnings.map((w) => `⚠️ ${w}`)] };
  await store.setJSON(`lessons/${finalId}`, saved);
  const kids = cleanChildren(children) ?? CHILD_IDS;
  const meta = await updateMeta(store, (m) => ({ ...m, [finalId]: { children: kids, status: "brouillon", aiGrading: aiGrading !== false } }));
  return { lesson: saved, meta, fixes, warnings };
}

export async function handleLessons(req, store, { parentCode } = {}) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      const [lessons, meta, costs, children, requests] = await Promise.all([readLessons(store), readMeta(store), readCosts(store), readJSON(store, CHILDREN_KEY, {}), readRequests(store)]);
      return json({ lessons, meta, costs, children, requests });
    }

    // demande de leçon faite par un enfant (pas de code parent : c'est l'enfant qui écrit)
    if (req.method === "POST" && url.searchParams.get("action") === "request") {
      const body = await req.json().catch(() => ({}));
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
      if (!CHILD_IDS.includes(body.child) || text.length < 3) return json({ error: "bad_request" }, 400);
      if ((await readRequests(store)).length >= MAX_REQUESTS) return json({ error: "trop_de_demandes" }, 429);
      const r = { id: `req-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, child: body.child, text, subject: typeof body.subject === "string" ? body.subject.slice(0, 60) : "", createdAt: Date.now() };
      await store.setJSON(`requests/${r.id}`, r);
      return json({ request: r }, 201);
    }

    if (!parentCodeOk(req, parentCode)) return json({ error: "code_parent" }, 401);

    if (req.method === "DELETE" && url.searchParams.get("request")) {
      const rid = url.searchParams.get("request");
      if (!/^req-[a-z0-9]+$/.test(rid)) return json({ error: "bad_request" }, 400);
      await store.delete(`requests/${rid}`);
      return json({ ok: true });
    }

    // classe de chaque enfant : { aurelius: { level: "5e" } }
    if (req.method === "PUT" && url.searchParams.get("settings") === "children") {
      const body = await req.json().catch(() => ({}));
      const cur = await readJSON(store, CHILDREN_KEY, {});
      for (const c of CHILD_IDS) {
        if (body[c]?.level === undefined) continue;
        const level = body[c].level === null ? null : levelOf(body[c].level);
        if (body[c].level !== null && !level) return json({ error: "bad_level" }, 400);
        cur[c] = { ...cur[c], level };
      }
      await store.setJSON(CHILDREN_KEY, cur);
      return json({ children: cur });
    }

    if (req.method === "POST") {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: "trop_gros" }, 413);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "bad_request" }, 400);
      }
      const out = await saveNewLesson(store, body?.lesson, body?.children, {}, { aiGrading: body?.aiGrading });
      if (out.errors) return json({ error: "lecon_invalide", errors: out.errors, fixes: out.fixes }, 422);
      return json(out, 201);
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
      // titre, matière, niveau corrigés par le parent
      for (const k of ["title", "subject"]) {
        if (body[k] === undefined) continue;
        const v = typeof body[k] === "string" ? body[k].trim().slice(0, 120) : "";
        if (!v) return json({ error: `bad_${k}` }, 400);
        patch[k] = v;
      }
      if (body.level !== undefined) {
        const level = levelOf(body.level);
        if (!level) return json({ error: "bad_level" }, 400);
        patch.level = level;
      }
      if (body.aiGrading !== undefined) {
        if (typeof body.aiGrading !== "boolean") return json({ error: "bad_ai_grading" }, 400);
        patch.aiGrading = body.aiGrading;
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
