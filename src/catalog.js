// Catalogue des leçons côté client : leçons intégrées au code + leçons créées
// avec Claude (stockées sur le serveur), avec leur affectation aux enfants et
// leur statut (brouillon / publiée) décidés dans l'espace parents.
import { LESSONS } from "./lessons/index.js";
import { CHILDREN } from "./data/children.js";
import { lsGet, lsSet } from "./lib/storage.js";

const K_CACHE = "precepteur:catalog";
const BUILTIN = LESSONS.map((l) => ({ ...l, builtin: true }));

export const catalog = { dynamic: [], meta: {}, costs: { grading: {}, failed: 0 }, ...lsGet(K_CACHE, {}) };

export function setCatalog({ lessons = [], meta = {}, costs = { grading: {}, failed: 0 } }) {
  catalog.dynamic = lessons;
  catalog.meta = meta;
  catalog.costs = costs;
  lsSet(K_CACHE, { dynamic: lessons, meta, costs });
}

/** Correction IA des réponses libres activée pour cette leçon ? */
export const aiGradingOf = (lesson) => catalog.meta[lesson.id]?.aiGrading ?? lesson.aiGrading ?? true;

/** Coûts IA d'une leçon : création + corrections (toutes ou pour un enfant). */
export function lessonCosts(lesson, childId = null) {
  const byChild = catalog.costs?.grading?.[lesson.id] || {};
  const entries = childId ? [byChild[childId]].filter(Boolean) : Object.values(byChild);
  return {
    creation: lesson.aiCost?.creation || 0,
    model: lesson.aiCost?.model,
    grading: entries.reduce((s, x) => s + x.usd, 0),
    graded: entries.reduce((s, x) => s + x.n, 0),
  };
}

export const allLessons = () => [...BUILTIN, ...catalog.dynamic.filter((d) => !BUILTIN.some((b) => b.id === d.id))];

export const lessonById = (id) => allLessons().find((l) => l.id === id);

/** Enfants à qui la leçon est destinée (réglage parent > valeur par défaut de la leçon). */
export const childrenOf = (lesson) => catalog.meta[lesson.id]?.children ?? lesson.children ?? CHILDREN.map((c) => c.id);

/** "publiee" ou "brouillon" ; les leçons intégrées sont publiées par défaut. */
export const statusOf = (lesson) => catalog.meta[lesson.id]?.status ?? (lesson.builtin ? "publiee" : "brouillon");

/** Leçons visibles par un enfant, les plus récentes d'abord. */
export const lessonsFor = (childId) =>
  allLessons()
    .filter((l) => statusOf(l) === "publiee" && childrenOf(l).includes(childId))
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));

export function findQuestion(lessonId, qid) {
  const [sid, id] = String(qid || "").split("/");
  return lessonById(lessonId)?.series.find((s) => s.id === sid)?.questions.find((q) => q.id === id) ?? null;
}

export async function loadCatalog() {
  try {
    const res = await fetch("/api/lessons", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    setCatalog(await res.json());
    return true;
  } catch {
    return false; // hors ligne : on garde le cache local
  }
}
