// Tableau de bord parent : résumé des deux enfants, coûts IA, matières, puis
// le détail d'un enfant (onglets) : activité, notes, leçons, points faibles,
// journal, réponses libres (avec validation des points réclamés).
import { CHILDREN, childById } from "../data/children.js";
import { lessonsFor, lessonById, findQuestion, allLessons, lessonCosts, catalog, childrenOf, childLevel, loadCatalog } from "../catalog.js";
import { MODELS, formatUsd } from "../lib/pricing.js";
import { lessonProgress, childOverview, dailyActivity, weakQuestions, levelOf as xpLevelOf, STATUS_LABEL, subjectBreakdown, withAllSubjects, isArchived, reviewsOf, attemptNote } from "../lib/stats.js";
import { LEVELS, programUrl, taughtSubjects } from "../data/subjects.js";
import { escapeHtml, rich, formatDate, formatDuration, formatNote, plural } from "../lib/format.js";
import { lsGet, lsSet } from "../lib/storage.js";
import { record } from "../lib/store.js";
import { topbar, noteBadge, subjectTag } from "./common.js";
import { refresh, addLocalRecord } from "../app.js";
import { parentTabs, parentFetch } from "./lessons-admin.js";

const PAGE_LABEL = { reviser: "a révisé la fiche", entrainer: "a regardé les séries", "plus-loin": "a lu « Plus loin »", lecon: "a ouvert la leçon", accueil: "était sur l'accueil", serie: "a commencé une série sans la finir" };
const COSTS_PER_PAGE = 15;
const LESSONS_PER_PAGE = 20;
const LIST_FIRST = 6; // entrées visibles d'abord dans les listes longues
const LIST_STEP = 10;
const K_TAB = "precepteur:dash-child";

const kidsBadges = (lesson) =>
  childrenOf(lesson)
    .map((id) => childById(id))
    .filter(Boolean)
    .map((c) => `<span class="kid-badge" style="--c:${c.color};--cs:${c.soft}" title="${escapeHtml(c.name)}">${c.emblem} ${escapeHtml(c.name)}</span>`)
    .join(" ") || `<span class="muted small">personne</span>`;

/** Coût IA imputé à un enfant : création de ses leçons (partagée entre les enfants concernés) + ses corrections. */
export function childCost(childId) {
  let total = 0;
  for (const l of allLessons()) {
    const kids = childrenOf(l);
    const c = lessonCosts(l, childId);
    if (kids.includes(childId) && kids.length) total += c.creation / kids.length;
    total += c.grading;
  }
  return total;
}

// ───────── graphiques SVG (une seule série chacun, infobulles au survol) ─────────
const fmtQuarter = (min) => {
  if (min === 0) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
};

/** Temps par jour, en heures : graduation tous les quarts d'heure. */
function activityChart(days, color) {
  const W = 560, H = 150, P = { l: 52, r: 6, t: 8, b: 20 };
  const maxMin = days.reduce((m, d) => Math.max(m, d.ms / 60000), 0);
  const top = Math.max(60, Math.ceil(maxMin / 15) * 15); // au moins 1 h, arrondi au quart d'heure
  const bw = (W - P.l - P.r) / days.length;
  const y = (m) => H - P.b - (m / top) * (H - P.t - P.b);
  const quarters = Array.from({ length: top / 15 + 1 }, (_, i) => i * 15);
  const labelEvery = top <= 120 ? 15 : top <= 240 ? 30 : 60; // étiquettes lisibles, grille au quart d'heure
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temps d'activité par jour sur 4 semaines">
    ${quarters
      .map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid ${t % 60 ? "minor" : ""}"/>${t % labelEvery === 0 ? `<text x="${P.l - 6}" y="${y(t) + 3}" class="axis" text-anchor="end">${fmtQuarter(t)}</text>` : ""}`)
      .join("")}
    ${days
      .map((d, i) => {
        const m = d.ms / 60000;
        const x = P.l + i * bw;
        const h = Math.max(m > 0 ? 3 : 0, H - P.b - y(m));
        const label = new Date(d.ts).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
        return `<g class="hit"><title>${label} : ${m > 0 && m < 1 ? "< 1 min" : formatDuration(d.ms)}</title><rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent"/>
          ${h ? `<rect x="${x + 1.5}" y="${H - P.b - h}" width="${Math.max(2, bw - 3)}" height="${h}" rx="2" fill="${color}"/>` : ""}</g>`;
      })
      .join("")}
    ${[0, 7, 14, 21, days.length - 1].map((i) => `<text x="${P.l + i * bw + bw / 2}" y="${H - 5}" class="axis" text-anchor="middle">${new Date(days[i].ts).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" })}</text>`).join("")}
  </svg>`;
}

function notesChart(attempts, color, reviews) {
  if (attempts.length < 2) return `<p class="muted small">Le graphique des notes apparaîtra après quelques séries.</p>`;
  const W = 560, H = 150, P = { l: 30, r: 10, t: 10, b: 18 };
  const n = attempts.length;
  const x = (i) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / 20) * (H - P.t - P.b);
  const pts = attempts.map((a) => attemptNote(a, reviews));
  const path = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Notes sur 20 des dernières séries">
    ${[0, 10, 20].map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 4}" y="${y(t) + 3}" class="axis" text-anchor="end">${t}</text>`).join("")}
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(12)}" y2="${y(12)}" class="ref"/><text x="${W - P.r}" y="${y(12) - 3}" class="axis" text-anchor="end">seuil 12</text>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${attempts
      .map((a, i) => {
        const l = lessonById(a.lessonId);
        const s = l?.series.find((z) => z.id === a.seriesId);
        const kind = a.mode === "retry" ? " (reprise des erreurs)" : a.mode === "redo" ? " (leçon refaite)" : "";
        return `<g class="hit"><title>${formatDate(a.ts)} — ${escapeHtml(s?.title || l?.title || "")} : ${formatNote(pts[i])}/20${kind}</title>
          <circle cx="${x(i)}" cy="${y(pts[i])}" r="12" fill="transparent"/><circle cx="${x(i)}" cy="${y(pts[i])}" r="4.5" fill="${a.mode && a.mode !== "normal" ? "var(--card)" : color}" stroke="${color}" stroke-width="2"/></g>`;
      })
      .join("")}
  </svg>`;
}

// ───────── pagination et listes progressives ─────────
function pager(page, pages, cls) {
  if (pages <= 1) return "";
  return `<nav class="pager ${cls}" aria-label="Pages"><button type="button" class="btn ghost small" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Précédent</button>
    <span class="muted small">Page ${page} / ${pages}</span>
    <button type="button" class="btn ghost small" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Suivant ›</button></nav>`;
}

/** Liste longue : quelques entrées, puis « Voir plus » (par paquets) et « Voir tout ». */
function revealList(container, items, { tag = "ul", cls = "" } = {}) {
  let shown = Math.min(LIST_FIRST, items.length);
  const draw = () => {
    container.innerHTML = `<${tag} class="${cls} capped">${items.slice(0, shown).join("")}</${tag}>
      ${shown < items.length ? `<div class="more-row"><span class="muted small">${shown} sur ${items.length}</span><button type="button" class="btn ghost small more">Voir plus</button><button type="button" class="btn ghost small all">Voir tout</button></div>` : ""}`;
    container.querySelector(".more")?.addEventListener("click", () => {
      shown = Math.min(items.length, shown + LIST_STEP);
      draw();
    });
    container.querySelector(".all")?.addEventListener("click", () => {
      shown = items.length;
      draw();
    });
    container.dispatchEvent(new CustomEvent("drawn", { bubbles: false }));
  };
  draw();
}

// ───────── blocs ─────────
function summaryCard(child, ov) {
  const lvl = xpLevelOf(ov.xp);
  const level = childLevel(child.id);
  return `<div class="card summary" style="--c:${child.color}">
    <h2><span class="emblem">${child.emblem}</span> ${escapeHtml(child.name)}${level ? ` <small class="muted">· ${escapeHtml(level)}</small>` : ""}</h2>
    <div class="tiles">
      <div class="tile"><span class="tile-v">${ov.avgNote === null ? "–" : formatNote(ov.avgNote)}</span><span class="tile-l">moyenne /20 (notes initiales)</span></div>
      <div class="tile"><span class="tile-v">${formatDuration(ov.weekTimeMs)}</span><span class="tile-l">sur 7 jours</span></div>
      <div class="tile"><span class="tile-v">${formatDuration(ov.timeMs)}</span><span class="tile-l">au total</span></div>
      <div class="tile"><span class="tile-v">${ov.attempts}</span><span class="tile-l">séries faites</span></div>
      <div class="tile"><span class="tile-v">🔥 ${ov.streak}</span><span class="tile-l">jours d'affilée</span></div>
      <div class="tile"><span class="tile-v">${formatUsd(childCost(child.id))}</span><span class="tile-l">coût IA de ses leçons</span></div>
    </div>
    <p class="muted small">Niveau ${lvl.index} (${lvl.title}) · ${ov.xp} XP · dernière activité : ${ov.lastTs ? formatDate(ov.lastTs) : "jamais"}</p>
    <button type="button" class="btn ghost small goto" data-child="${child.id}">Voir le détail ↓</button>
  </div>`;
}

/** Coûts IA de toutes les leçons, les plus récentes en haut, 15 par page. */
function costsCard(page) {
  const rows = allLessons()
    .map((l) => ({ l, c: lessonCosts(l), date: l.createdAt || Date.parse(l.addedAt) || 0 }))
    .filter(({ c }) => c.creation || c.grading)
    .sort((a, b) => b.date - a.date);
  const creation = rows.reduce((s, r) => s + r.c.creation, 0);
  const grading = rows.reduce((s, r) => s + r.c.grading, 0);
  const failed = catalog.costs?.failed || 0;
  const pages = Math.max(1, Math.ceil(rows.length / COSTS_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = rows.slice((p - 1) * COSTS_PER_PAGE, p * COSTS_PER_PAGE);
  return `<section class="card costs-card">
    <h2>💶 Coûts IA</h2>
    <div class="tiles">
      <div class="tile"><span class="tile-v">${formatUsd(creation + grading + failed)}</span><span class="tile-l">au total</span></div>
      <div class="tile"><span class="tile-v">${formatUsd(creation)}</span><span class="tile-l">créations de leçons</span></div>
      <div class="tile"><span class="tile-v">${formatUsd(grading)}</span><span class="tile-l">corrections de réponses</span></div>
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Date</th><th>Leçon</th><th>Pour</th><th>Création</th><th>Corrections IA</th><th>Total</th></tr></thead><tbody>${slice
      .map(
        ({ l, c, date }) => `<tr><td class="nowrap">${date ? formatDate(date) : "–"}</td><td>${subjectTag(l, { short: true })}<br>${escapeHtml(l.title)}</td><td>${kidsBadges(l)}</td>
          <td>${l.builtin ? "intégrée" : `${formatUsd(c.creation)}${c.model ? ` <small class="muted">${MODELS[c.model]?.label || ""}</small>` : ""}`}</td>
          <td>${c.graded ? `${formatUsd(c.grading)} <small class="muted">(${c.graded} rép.)</small>` : "–"}</td><td><strong>${formatUsd(c.creation + c.grading)}</strong></td></tr>`,
      )
      .join("")}</tbody></table></div>${pager(p, pages, "costs-pager")}` : `<p class="muted small">Aucun coût IA pour l'instant.</p>`}
    ${failed ? `<p class="muted small">Dont ${formatUsd(failed)} de créations qui n'ont pas abouti.</p>` : ""}
    <p class="muted small">Montants calculés d'après les tarifs Anthropic ; la facture exacte est sur console.anthropic.com.</p>
  </section>`;
}

/** Tableau des matières : icône, nombre de leçons, notes, coût, lien vers le programme. */
function subjectsTable(records, child = null) {
  const kids = child ? [child] : CHILDREN;
  const items = [];
  const lessons = child ? lessonsFor(child.id) : allLessons();
  for (const l of lessons) {
    // une ligne de stats par enfant concerné, pour les moyennes
    for (const k of kids.filter((k) => childrenOf(l).includes(k.id)))
      items.push({ lesson: l, p: lessonProgress(l, records, k.id), archived: isArchived(records, k.id, l.id), kid: k.id });
    if (!child && !kids.some((k) => childrenOf(l).includes(k.id))) items.push({ lesson: l, p: lessonProgress(l, records, "_"), archived: false });
  }
  // toutes les matières enseignées aux classes des enfants, même sans leçon
  const levels = kids.map((k) => childLevel(k.id));
  const rows = withAllSubjects(subjectBreakdown(items), taughtSubjects(levels.every(Boolean) ? levels : []));
  const cost = (r) => {
    const uniq = [...new Map(r.lessons.map((l) => [l.id, l])).values()];
    return uniq.reduce((s, l) => {
      const c = lessonCosts(l, child?.id ?? null);
      const share = child ? (childrenOf(l).includes(child.id) ? c.creation / childrenOf(l).length : 0) : c.creation;
      return s + share + c.grading;
    }, 0);
  };
  const programLinks = (r) =>
    kids
      .map((k) => {
        const level = childLevel(k.id);
        const url = level && programUrl(level);
        return url ? `<a href="${url}" target="_blank" rel="noopener">${child ? "" : `${k.emblem} `}Programme ${escapeHtml(level)} ↗</a>` : `<span class="muted small">${child ? "" : `${k.emblem} `}classe non renseignée</span>`;
      })
      .join("<br>");
  return `<div class="table-wrap"><table class="dash-table subjects-table"><thead><tr><th>Matière</th><th>Leçons</th><th>Note initiale</th><th>Après reprise</th><th>Coût IA</th><th>Programme officiel</th></tr></thead><tbody>${rows
    .map(
      (r) => `<tr class="${r.count ? "" : "no-lesson"}"><td class="nowrap"><span class="subj-icon">${r.subject.icon}</span> ${escapeHtml(r.label)}${r.subject.option ? ` <small class="muted">(option)</small>` : ""}</td><td>${new Set(r.lessons.map((l) => l.id)).size}</td>
        <td>${noteBadge(r.avg)}</td><td>${noteBadge(r.avgReprise)}</td><td>${formatUsd(cost(r))}</td><td class="small">${programLinks(r)}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}

function levelPicker(child) {
  const cur = childLevel(child.id);
  return `<div class="level-picker"><span class="muted small">Classe de ${escapeHtml(child.name)} (pour les liens vers le programme) :</span>
    <div class="chips">${LEVELS.map((l) => `<button type="button" class="chip ${cur === l ? "selected" : ""}" data-level="${l}">${l}</button>`).join("")}</div></div>`;
}

/** Leçons d'un enfant : repliées par défaut (détail des séries escamoté), 20 par page. */
function lessonsTable(child, records, page) {
  const lessons = lessonsFor(child.id);
  const pages = Math.max(1, Math.ceil(lessons.length / LESSONS_PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const rows = lessons.slice((p - 1) * LESSONS_PER_PAGE, p * LESSONS_PER_PAGE).map((l) => {
    const pr = lessonProgress(l, records, child.id);
    const c = lessonCosts(l, child.id);
    const detail = l.series
      .map((s) => {
        const sm = pr.series[s.id];
        return `<tr class="sub" hidden><td>↳ ${rich(s.title)}</td><td>${sm.attempts ? noteBadge(sm.initial) : "–"}</td><td>${sm.attempts && sm.reprise !== null ? noteBadge(sm.reprise) : "–"}</td><td>${sm.attempts ? formatDuration(sm.timeMs) : "–"}</td><td>${sm.lastTs ? formatDate(sm.lastTs) : "–"}</td><td></td></tr>`;
      })
      .join("");
    return `<tbody class="lesson-rows" data-lesson="${escapeHtml(l.id)}"><tr class="main">
      <td><button type="button" class="toggle-row" aria-expanded="false" aria-label="Voir le détail des tests" title="Voir le détail des tests">▸</button>
        <span class="lr-title">${subjectTag(l, { short: true })}<strong>${escapeHtml(l.title)}</strong>
        <small class="muted"><span class="pill status status-${pr.status}">${STATUS_LABEL[pr.status]}</span> · ${pr.done}/${pr.total} séries${isArchived(records, child.id, l.id) ? " · archivée" : ""}</small></span></td>
      <td>${noteBadge(pr.note)}</td><td>${pr.hasReprise ? noteBadge(pr.reprise) : "–"}</td><td>${formatDuration(pr.timeMs)}</td><td>${pr.lastTs ? formatDate(pr.lastTs) : "–"}</td>
      <td title="Création (part) + réponses libres corrigées par l'IA">${formatUsd(c.creation / Math.max(1, childrenOf(l).length) + c.grading)}${c.graded ? `<br><small class="muted">${c.graded} rép.</small>` : ""}</td></tr>${detail}</tbody>`;
  });
  return `<div class="table-wrap"><table class="dash-table lessons-table"><thead><tr><th>Leçon</th><th>Note initiale</th><th>Après reprise</th><th>Temps</th><th>Dernière fois</th><th>Coût IA</th></tr></thead>${rows.join("")}</table></div>${pager(p, pages, "lessons-pager")}`;
}

function weakItems(child, records) {
  return weakQuestions(records, child.id, 200).map((w) => {
    const q = findQuestion(w.lessonId, w.qid);
    const l = lessonById(w.lessonId);
    return `<li><div><span>${q ? rich(q.prompt) : escapeHtml(w.qid)}</span><small class="muted">${l ? `${escapeHtml(l.icon)} ${escapeHtml(l.title)} · ` : ""}Dernière réponse : « ${escapeHtml(String(w.lastGiven ?? "").slice(0, 140))} »</small></div>
      <span class="rate" title="Taux de réussite moyen sur ${w.tries} essai(s)">${Math.round(w.rate * 100)} %<small>${w.tries} essai${w.tries > 1 ? "s" : ""}</small></span></li>`;
  });
}

function journalItems(child, records) {
  return records
    .filter((r) => r.child === child.id && (r.type === "attempt" || r.type === "visit" || r.type === "archive"))
    .reverse()
    .map((r) => {
      const l = lessonById(r.lessonId);
      const where = l ? `<small class="muted">(${escapeHtml(l.icon)} ${escapeHtml(l.title)})</small>` : "";
      if (r.type === "attempt") {
        const s = l?.series.find((z) => z.id === r.seriesId);
        const what = r.mode === "retry" ? (s ? `a refait les questions mal répondues de « ${escapeHtml(s.title)} »` : "a refait ses questions ratées") : r.mode === "redo" ? "a refait toute la leçon" : `a fait « ${escapeHtml(s?.title || r.seriesId)} »`;
        return `<li><span class="j-date">${formatDate(r.ts)}</span><span>✏️ ${what} ${where}</span><span class="j-end">${noteBadge(r.note20)} <small class="muted">${formatDuration(r.durationMs)}</small></span></li>`;
      }
      if (r.type === "archive") return `<li><span class="j-date">${formatDate(r.ts)}</span><span>🗄️ ${r.archived ? "a archivé" : "a ressorti des archives"} ${where}</span><span></span></li>`;
      return `<li><span class="j-date">${formatDate(r.ts)}</span><span>👀 ${PAGE_LABEL[r.page] || "a navigué"} ${where}</span><span class="j-end"><small class="muted">${formatDuration(r.durationMs)}</small></span></li>`;
    });
}

/** Réponses libres ; celles dont l'enfant a réclamé les points ressortent, à valider. */
function freeItems(child, records) {
  const reviews = reviewsOf(records);
  const list = [];
  for (const r of records) {
    if (r.type !== "attempt" || r.child !== child.id) continue;
    for (const a of r.answers || []) {
      const q = findQuestion(r.lessonId, a.qid);
      if (q?.type === "libre" && a.given) list.push({ r, a, q, decision: reviews.get(`${r.id}|${a.qid}`) });
    }
  }
  list.reverse();
  // à vérifier d'abord
  const pendingOf = (x) => (x.a.claimed === true && !x.decision ? 1 : 0);
  list.sort((x, y) => pendingOf(y) - pendingOf(x));
  return list.map(({ r, a, q, decision }) => {
    const pending = a.claimed && !decision;
    const l = lessonById(r.lessonId);
    const test = l?.series.find((z) => z.id === String(a.qid).split("/")[0]);
    const kind = r.mode === "retry" ? " · reprise des erreurs" : r.mode === "redo" ? " · leçon refaite" : "";
    return `<article class="free-answer ${pending ? "claimed" : ""}" data-attempt="${escapeHtml(r.id)}" data-qid="${escapeHtml(a.qid)}">
      <p class="fa-lesson">${l ? `${subjectTag(l, { short: true })} <a href="#/apercu/${encodeURIComponent(l.id)}">${escapeHtml(l.title)}</a>` : `<span class="muted">Leçon supprimée</span>`}${test ? `<span class="fa-test">✏️ ${escapeHtml(test.title)}</span>` : ""}<span class="muted small">${formatDate(r.ts)}${kind}</span></p>
      ${a.claimed ? `<p class="claim-flag">${pending ? "✋ <strong>Points réclamés par l'enfant — à vérifier</strong>" : decision === "valide" ? "✅ Points réclamés — validés" : "❌ Points réclamés — refusés"} <small class="muted">(score obtenu à la correction : ${formatNote(a.origScore ?? 0)}/${a.max})</small></p>` : ""}
      <header><strong>${rich(q.prompt)}</strong><span>${formatNote(a.claimed && decision === "refuse" ? a.origScore ?? 0 : a.score)}/${a.max}</span></header>
      <blockquote>${escapeHtml(a.given)}</blockquote>
      <details class="small"><summary>Réponse modèle</summary><p>${rich(q.model)}</p></details>
      ${a.hint ? `<p class="muted small">Coup de pouce utilisé</p>` : ""}
      ${a.ai ? `<p class="small"><strong>Correction IA :</strong> ${escapeHtml(a.ai)}</p>` : ""}
      ${a.claimed ? `<div class="actions review-actions">${decision !== "valide" ? `<button type="button" class="btn small primary" data-decision="valide">✅ Valider les points</button>` : ""}${decision !== "refuse" ? `<button type="button" class="btn ghost small danger" data-decision="refuse">❌ Refuser</button>` : ""}</div>` : ""}
    </article>`;
  });
}

function childPanel(child, records, ui) {
  const reviews = reviewsOf(records);
  const level = childLevel(child.id);
  return `<section class="child-dash" id="dash-${child.id}" style="--c:${child.color}">
    <div class="card">
      <h3>📚 Matières de ${escapeHtml(child.name)}${level ? ` <small class="muted">· ${escapeHtml(level)}</small>` : ""}</h3>
      ${levelPicker(child)}
      ${subjectsTable(records, child)}
    </div>
    <div class="dash-grid">
      <div class="card"><h3>Temps d'activité (28 jours)</h3>${activityChart(dailyActivity(records, child.id), child.color)}</div>
      <div class="card"><h3>Notes des séries (/20)</h3>${notesChart(records.filter((r) => r.type === "attempt" && r.child === child.id).slice(-30), child.color, reviews)}<p class="muted small">Point plein : 1re tentative ou série refaite · point creux : reprise.</p></div>
    </div>
    <div class="card"><h3>Leçons</h3><p class="muted small">Touchez ▸ pour voir le détail des séries.</p><div class="lessons-zone">${lessonsTable(child, records, ui.lessonsPage)}</div></div>
    <div class="dash-grid">
      <div class="card"><h3>🎯 Points faibles</h3><div class="weak-zone"></div></div>
      <div class="card"><h3>🕘 Journal</h3><div class="journal-zone"></div></div>
    </div>
    <div class="card"><h3>✍️ Réponses libres</h3><div class="free-zone"></div></div>
  </section>`;
}

export function renderDashboard(app, state, ui = { costsPage: 1, lessonsPage: 1 }) {
  const { records } = state;
  const overviews = CHILDREN.map((c) => ({ c, ov: childOverview(records, c.id) }));
  const current = childById(lsGet(K_TAB, CHILDREN[0].id)) || CHILDREN[0];
  app.innerHTML = `
    ${topbar({ back: "#/", backLabel: "Accueil", title: "Espace parents" })}
    <main class="page dashboard">
      ${parentTabs("suivi")}
      <header class="dash-head">
        <div><h1>Tableau de bord</h1><p class="muted small">${state.online ? `Données à jour (${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}), tous appareils confondus.` : "⚠️ Serveur injoignable : seules les données de cet appareil sont affichées."}</p></div>
        <button type="button" class="btn ghost small reload">↻ Actualiser</button>
      </header>
      <div class="summaries">${overviews.map(({ c, ov }) => summaryCard(c, ov)).join("")}</div>
      ${costsCard(ui.costsPage)}
      <section class="card"><h2>📚 Matières (tous les enfants)</h2>${subjectsTable(records)}</section>

      <nav class="child-tabs dash-child-tabs" role="tablist" aria-label="Détail par enfant">
        ${CHILDREN.map((c) => `<button type="button" role="tab" class="child-tab ${c.id === current.id ? "active" : ""}" aria-selected="${c.id === current.id}" data-child="${c.id}" style="--c:${c.color};--cs:${c.soft}"><span class="emblem">${c.emblem}</span>${escapeHtml(c.name)}</button>`).join("")}
      </nav>
      ${childPanel(current, records, ui)}
      <p class="footnote muted small">Ce tableau de bord est ouvert (pas de mot de passe) pour le moment. Les données sont stockées dans Netlify Blobs.</p>
    </main>`;

  const rerender = (patch = {}) => renderDashboard(app, state, { ...ui, ...patch });
  const show = (id) => {
    lsSet(K_TAB, id);
    rerender({ lessonsPage: 1 });
    document.getElementById(`dash-${id}`)?.scrollIntoView({ behavior: "smooth" });
  };
  app.querySelectorAll(".goto").forEach((b) => b.addEventListener("click", () => show(b.dataset.child)));
  app.querySelectorAll(".dash-child-tabs [data-child]").forEach((b) => b.addEventListener("click", () => show(b.dataset.child)));
  app.querySelectorAll(".costs-pager [data-page]").forEach((b) => b.addEventListener("click", () => rerender({ costsPage: Number(b.dataset.page) })));
  app.querySelectorAll(".lessons-pager [data-page]").forEach((b) => b.addEventListener("click", () => rerender({ lessonsPage: Number(b.dataset.page) })));
  app.querySelectorAll(".toggle-row").forEach((b) =>
    b.addEventListener("click", () => {
      const open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      b.textContent = open ? "▾" : "▸";
      b.closest("tbody").querySelectorAll("tr.sub").forEach((tr) => (tr.hidden = !open));
    }),
  );
  app.querySelectorAll(".level-picker [data-level]").forEach((b) =>
    b.addEventListener("click", async () => {
      const level = childLevel(current.id) === b.dataset.level ? null : b.dataset.level;
      const res = await parentFetch("/api/lessons?settings=children", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [current.id]: { level } }) });
      if (res.ok) {
        await loadCatalog();
        rerender();
      }
    }),
  );

  revealList(app.querySelector(".weak-zone"), weakItems(current, records), { cls: "weak" });
  revealList(app.querySelector(".journal-zone"), journalItems(current, records), { cls: "journal" });
  const freeZone = app.querySelector(".free-zone");
  const free = freeItems(current, records);
  if (!free.length) freeZone.innerHTML = `<p class="muted small">Pas encore de réponse libre.</p>`;
  else revealList(freeZone, free, { tag: "div", cls: "free-answers" });
  // validation des points réclamés (délégation : la liste est redessinée par « Voir plus »)
  freeZone.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-decision]");
    if (!btn) return;
    const card = btn.closest(".free-answer");
    addLocalRecord(record({ type: "review", child: current.id, attemptId: card.dataset.attempt, qid: card.dataset.qid, decision: btn.dataset.decision }));
    rerender();
  });
  if (!records.some((r) => r.type === "attempt" || r.type === "visit")) {
    app.querySelector(".weak-zone").innerHTML = `<p class="muted small">Aucune difficulté repérée pour l'instant.</p>`;
    app.querySelector(".journal-zone").innerHTML = `<p class="muted small">Aucune activité enregistrée.</p>`;
  }

  app.querySelector(".reload").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    await refresh();
    rerender();
  });
}
