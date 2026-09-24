// Calculs de progression à partir du journal (records). Fonctions pures.

export const PASS_NOTE = 12; // en dessous (sur 20), la leçon est « à revoir »
const DAY = 86400000;

const attemptsOf = (records, child, lessonId) =>
  records.filter((r) => r.type === "attempt" && r.child === child && (!lessonId || r.lessonId === lessonId) && r.mode !== "retry");

export function seriesSummary(records, child, lessonId, seriesId) {
  const list = attemptsOf(records, child, lessonId).filter((r) => r.seriesId === seriesId);
  if (!list.length) return { attempts: 0, best: null, last: null, lastTs: null, timeMs: 0 };
  const last = list[list.length - 1];
  return {
    attempts: list.length,
    best: Math.max(...list.map((r) => r.note20 ?? 0)),
    last: last.note20 ?? 0,
    lastTs: last.ts,
    timeMs: list.reduce((s, r) => s + (r.durationMs || 0), 0),
  };
}

/**
 * Où en est un enfant sur une leçon.
 * status : "nouveau" | "en-cours" | "a-revoir" | "maitrise"
 * note   : moyenne des meilleures notes des séries faites (/20), null si rien
 */
export function lessonProgress(lesson, records, child) {
  const series = {};
  for (const s of lesson.series) series[s.id] = seriesSummary(records, child, lesson.id, s.id);
  const done = Object.values(series).filter((s) => s.attempts > 0);
  const visits = records.filter((r) => r.type === "visit" && r.child === child && r.lessonId === lesson.id);
  const note = done.length ? Math.round((done.reduce((s, x) => s + x.best, 0) / done.length) * 2) / 2 : null;
  const complete = done.length === lesson.series.length;
  let status = "nouveau";
  if (complete) status = note >= PASS_NOTE ? "maitrise" : "a-revoir";
  else if (done.length || visits.length) status = "en-cours";
  const tsList = [...done.map((s) => s.lastTs), ...visits.map((v) => v.ts)];
  return {
    series,
    done: done.length,
    total: lesson.series.length,
    note,
    status,
    complete,
    lastTs: tsList.length ? Math.max(...tsList) : null,
    timeMs: done.reduce((s, x) => s + x.timeMs, 0) + visits.reduce((s, v) => s + (v.durationMs || 0), 0),
  };
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
  const graded = attempts.filter((r) => r.mode !== "retry");
  const avg = graded.length ? Math.round((graded.reduce((s, r) => s + (r.note20 ?? 0), 0) / graded.length) * 10) / 10 : null;
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
