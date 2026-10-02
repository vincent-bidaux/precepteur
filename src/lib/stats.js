// Calculs de progression à partir du journal (records). Fonctions pures.

export const PASS_NOTE = 12; // en dessous (sur 20), la leçon est « à revoir »
const DAY = 86400000;

// Une « tentative normale » = une série faite en entier depuis sa carte.
// Les reprises (erreurs, leçon entière) ont mode "retry" / "redo".
const isNormal = (r) => !r.mode || r.mode === "normal";
const attemptsOf = (records, child, lessonId) =>
  records.filter((r) => r.type === "attempt" && r.child === child && (!lessonId || r.lessonId === lessonId) && isNormal(r));

/** Décisions du parent sur les points que l'enfant s'est attribués : « attemptId|qid » → "valide" | "refuse". */
export function reviewsOf(records) {
  const m = new Map();
  for (const r of records) if (r.type === "review") m.set(`${r.attemptId}|${r.qid}`, r.decision);
  return m;
}

/** Points d'une réponse, en tenant compte d'un éventuel refus du parent. */
export function answerPoints(attempt, a, reviews) {
  if (a.claimed && reviews?.get(`${attempt.id}|${a.qid}`) === "refuse") return a.origScore ?? 0;
  return a.score ?? 0;
}

/** Note /20 d'une tentative (recalculée si des points auto-attribués ont été refusés). */
export function attemptNote(attempt, reviews) {
  const answers = attempt.answers || [];
  if (!answers.some((a) => a.claimed) || !reviews) return attempt.note20 ?? 0;
  const max = answers.reduce((s, a) => s + (a.max || 0), 0);
  const got = answers.reduce((s, a) => s + answerPoints(attempt, a, reviews), 0);
  return max ? Math.round((got / max) * 40) / 2 : 0;
}

/** Meilleur score obtenu par question (toutes tentatives et reprises) : « serie/question » → { got, max }. */
export function bestByQuestion(records, child, lessonId) {
  const reviews = reviewsOf(records);
  const best = new Map();
  for (const r of records) {
    if (r.type !== "attempt" || r.child !== child || r.lessonId !== lessonId) continue;
    for (const a of r.answers || []) {
      const got = answerPoints(r, a, reviews);
      const cur = best.get(a.qid);
      if (!cur || got > cur.got) best.set(a.qid, { got, max: a.max || 1 });
    }
  }
  return best;
}

export function seriesSummary(records, child, lessonId, seriesId, { lesson = null } = {}) {
  const reviews = reviewsOf(records);
  const list = attemptsOf(records, child, lessonId).filter((r) => r.seriesId === seriesId);
  if (!list.length) return { attempts: 0, best: null, last: null, initial: null, reprise: null, lastTs: null, timeMs: 0 };
  const notes = list.map((r) => attemptNote(r, reviews));
  const last = list[list.length - 1];
  // note après reprise de la série : meilleur score de chaque question, toutes tentatives confondues
  let reprise = null;
  const series = lesson?.series.find((x) => x.id === seriesId);
  if (series) {
    const best = bestByQuestion(records, child, lessonId);
    let got = 0;
    let max = 0;
    for (const q of series.questions) {
      const b = best.get(`${seriesId}/${q.id}`);
      if (!b) continue;
      got += b.got;
      max += b.max;
    }
    reprise = max ? Math.round((got / max) * 40) / 2 : null;
  }
  return {
    attempts: list.length,
    initial: notes[0],
    best: Math.max(...notes),
    last: notes[notes.length - 1],
    reprise,
    lastTs: Math.max(...records.filter((r) => r.type === "attempt" && r.child === child && r.lessonId === lessonId).map((r) => r.ts)),
    timeMs: list.reduce((s, r) => s + (r.durationMs || 0), 0),
  };
}

/**
 * Où en est un enfant sur une leçon.
 * status  : "nouveau" | "en-cours" | "a-revoir" | "maitrise"
 * note    : note INITIALE (première tentative de chaque série) — c'est elle
 *           qui compte dans les moyennes : il faut se concentrer dès la 1re fois
 * reprise : note après reprise (meilleur score de chaque question), pour s'améliorer
 */
export function lessonProgress(lesson, records, child) {
  const series = {};
  for (const s of lesson.series) series[s.id] = seriesSummary(records, child, lesson.id, s.id, { lesson });
  const done = Object.values(series).filter((s) => s.attempts > 0);
  const visits = records.filter((r) => r.type === "visit" && r.child === child && r.lessonId === lesson.id);
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 2) / 2 : null);
  const note = avg(done.map((s) => s.initial));
  const reprise = avg(done.map((s) => s.reprise ?? s.initial));
  const complete = done.length === lesson.series.length;
  let status = "nouveau";
  if (complete) status = (reprise ?? note) >= PASS_NOTE ? "maitrise" : "a-revoir";
  else if (done.length || visits.length) status = "en-cours";
  const allAttempts = records.filter((r) => r.type === "attempt" && r.child === child && r.lessonId === lesson.id);
  const tsList = [...allAttempts.map((r) => r.ts), ...visits.map((v) => v.ts)];
  return {
    series,
    done: done.length,
    total: lesson.series.length,
    note,
    reprise,
    hasReprise: allAttempts.length > done.length, // au moins une tentative après la première
    status,
    complete,
    lastTs: tsList.length ? Math.max(...tsList) : null,
    timeMs: allAttempts.reduce((s, r) => s + (r.durationMs || 0), 0) + visits.reduce((s, v) => s + (v.durationMs || 0), 0),
  };
}

/** Questions encore ratées (meilleur score < max) dans les séries déjà faites : [{ series, q }]. */
export function wrongQuestions(lesson, records, child) {
  const best = bestByQuestion(records, child, lesson.id);
  const out = [];
  for (const s of lesson.series)
    for (const q of s.questions) {
      const b = best.get(`${s.id}/${q.id}`);
      if (b && b.got < b.max - 1e-9) out.push({ series: s, q });
    }
  return out;
}

/** Leçon rangée par l'enfant dans « Leçons archivées » ? (dernier geste qui compte) */
export function isArchived(records, child, lessonId) {
  let archived = false;
  for (const r of records) if (r.type === "archive" && r.child === child && r.lessonId === lessonId) archived = r.archived;
  return archived;
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Jours d'activité consécutifs jusqu'à aujourd'hui (ou hier, pour ne pas casser la série le matin). */
export function streak(records, child, now = Date.now()) {
  const days = new Set(records.filter((r) => r.child === child).map((r) => dayKey(r.ts)));
  let n = 0;
  let t = now;
  if (!days.has(dayKey(t))) t -= DAY;
  while (days.has(dayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
}

export const LEVELS = [
  { xp: 0, title: "Discipulus", desc: "élève" },
  { xp: 100, title: "Tiro", desc: "apprenti" },
  { xp: 300, title: "Scriba", desc: "scribe" },
  { xp: 600, title: "Rhetor", desc: "orateur" },
  { xp: 1000, title: "Magister", desc: "maître" },
  { xp: 1600, title: "Sapiens", desc: "sage" },
  { xp: 2500, title: "Philosophus", desc: "philosophe" },
];

export function xpOf(records, child) {
  const seen = new Set();
  let xp = 0;
  for (const r of records) {
    if (r.type !== "attempt" || r.child !== child) continue;
    xp += Math.round((r.note20 ?? 0) * 5); // jusqu'à 100 XP par série
    const k = `${r.lessonId}/${r.seriesId}`;
    if (!seen.has(k) && r.mode !== "retry") {
      seen.add(k);
      xp += 20; // bonus découverte
    }
  }
  return xp;
}

export function levelOf(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return { index: i + 1, ...cur, next, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

export function childOverview(records, child, now = Date.now()) {
  const mine = records.filter((r) => r.child === child);
  const attempts = mine.filter((r) => r.type === "attempt");
  const timeMs = mine.reduce((s, r) => s + (r.durationMs || 0), 0);
  const days = new Set(mine.map((r) => dayKey(r.ts)));
  // moyenne des notes INITIALES : première tentative de chaque série
  const reviews = reviewsOf(records);
  const firsts = new Map();
  for (const r of attempts) if (isNormal(r) && !firsts.has(`${r.lessonId}/${r.seriesId}`)) firsts.set(`${r.lessonId}/${r.seriesId}`, attemptNote(r, reviews));
  const avg = firsts.size ? Math.round(([...firsts.values()].reduce((a, b) => a + b, 0) / firsts.size) * 10) / 10 : null;
  const week = mine.filter((r) => r.ts > now - 7 * DAY);
  return {
    attempts: attempts.length,
    timeMs,
    weekTimeMs: week.reduce((s, r) => s + (r.durationMs || 0), 0),
    activeDays: days.size,
    avgNote: avg,
    lastTs: mine.length ? mine[mine.length - 1].ts : null,
    streak: streak(records, child, now),
    xp: xpOf(records, child),
  };
}

/** Temps d'activité par jour sur les n derniers jours (pour la frise). */
export function dailyActivity(records, child, n = 28, now = Date.now()) {
  const map = new Map();
  for (const r of records) if (r.child === child) map.set(dayKey(r.ts), (map.get(dayKey(r.ts)) || 0) + (r.durationMs || 0));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ts = now - i * DAY;
    out.push({ day: dayKey(ts), ts, ms: map.get(dayKey(ts)) || 0 });
  }
  return out;
}

/** Questions les plus souvent ratées (score < 1) par un enfant. */
export function weakQuestions(records, child, limit = 8) {
  const agg = new Map();
  for (const r of records) {
    if (r.type !== "attempt" || r.child !== child) continue;
    for (const a of r.answers || []) {
      const k = `${r.lessonId}|${a.qid}`;
      const cur = agg.get(k) || { lessonId: r.lessonId, qid: a.qid, tries: 0, sum: 0, lastGiven: null };
      cur.tries++;
      cur.sum += a.max ? a.score / a.max : 0;
      cur.lastGiven = a.given;
      agg.set(k, cur);
    }
  }
  return [...agg.values()]
    .map((x) => ({ ...x, rate: x.sum / x.tries }))
    .filter((x) => x.rate < 1)
    .sort((a, b) => a.rate - b.rate || b.tries - a.tries)
    .slice(0, limit);
}

export const STATUS_LABEL = {
  nouveau: "Nouveau",
  "en-cours": "En cours",
  "a-revoir": "À revoir",
  maitrise: "Réussie",
};

/**
 * Répartition par matière d'une liste [{ lesson, p, archived }] (p = lessonProgress).
 * → [{ subject, count, nouveau, enCours, reussies, archivees, avg, avgReprise, completion }]
 */
export function subjectBreakdown(items) {
  const by = new Map();
  for (const { lesson, p, archived } of items) {
    const s = lesson.subjectInfo || { id: "autre", label: lesson.subject, icon: "📘" };
    const key = s.id === "autre" ? `autre:${lesson.subject}` : s.id;
    const row = by.get(key) || { subject: s, label: s.id === "autre" ? lesson.subject : s.label, count: 0, nouveau: 0, enCours: 0, reussies: 0, archivees: 0, notes: [], reprises: [], done: 0, total: 0, lessons: [] };
    row.count++;
    row.lessons.push(lesson);
    if (archived) row.archivees++;
    else if (p.status === "nouveau") row.nouveau++;
    else if (p.status === "maitrise") row.reussies++;
    else row.enCours++;
    if (p.note !== null) row.notes.push(p.note);
    if (p.note !== null) row.reprises.push(p.reprise ?? p.note);
    row.done += p.done;
    row.total += p.total;
    by.set(key, row);
  }
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 2) / 2 : null);
  return [...by.values()]
    .map((r) => ({ ...r, avg: avg(r.notes), avgReprise: avg(r.reprises), completion: r.total ? r.done / r.total : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
