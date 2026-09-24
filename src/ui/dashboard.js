// Tableau de bord parent : temps passé, notes, points faibles, réponses libres.
// Ouvert sans mot de passe pour le moment (voir README pour le protéger).
import { CHILDREN } from "../data/children.js";
import { lessonsFor, lessonById, findQuestion } from "../lessons/index.js";
import { lessonProgress, childOverview, dailyActivity, weakQuestions, levelOf, STATUS_LABEL } from "../lib/stats.js";
import { escapeHtml, rich, formatDate, formatDuration, formatNote } from "../lib/format.js";
import { topbar, noteBadge } from "./common.js";
import { refresh } from "../app.js";

const SELF = { tout: "😎 « j'avais tout »", partie: "🤔 « en partie »", rien: "😅 « pas vraiment »" };
const PAGE_LABEL = { reviser: "a révisé la fiche", entrainer: "a regardé les séries", "plus-loin": "a lu « Aller plus loin »", lecon: "a ouvert la leçon", accueil: "était sur l'accueil", serie: "a commencé une série sans la finir" };

// ───────── graphiques SVG (une seule série chacun, infobulles au survol) ─────────
function activityChart(days, color) {
  const W = 560, H = 120, P = { l: 30, r: 6, t: 8, b: 20 };
  const maxMin = Math.max(10, ...days.map((d) => d.ms / 60000));
  const bw = (W - P.l - P.r) / days.length;
  const y = (m) => H - P.b - (m / maxMin) * (H - P.t - P.b);
  const ticks = [0, Math.round(maxMin / 2), Math.round(maxMin)];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes d'activité par jour sur 4 semaines">
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 4}" y="${y(t) + 3}" class="axis" text-anchor="end">${t}</text>`).join("")}
    ${days
      .map((d, i) => {
        const m = d.ms / 60000;
        const x = P.l + i * bw;
        const h = Math.max(m > 0 ? 3 : 0, H - P.b - y(m));
        const label = new Date(d.ts).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
        return `<g class="hit"><title>${label} : ${m < 1 && m > 0 ? "< 1" : Math.round(m)} min</title><rect x="${x}" y="${P.t}" width="${bw}" height="${H - P.t - P.b}" fill="transparent"/>
          ${h ? `<rect x="${x + 1.5}" y="${H - P.b - h}" width="${Math.max(2, bw - 3)}" height="${h}" rx="2" fill="${color}"/>` : ""}</g>`;
      })
      .join("")}
    ${[0, 7, 14, 21, days.length - 1].map((i) => `<text x="${P.l + i * bw + bw / 2}" y="${H - 5}" class="axis" text-anchor="middle">${new Date(days[i].ts).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric" })}</text>`).join("")}
  </svg>`;
}

function notesChart(attempts, color) {
  if (attempts.length < 2) return `<p class="muted small">Le graphique des notes apparaîtra après quelques séries.</p>`;
  const W = 560, H = 150, P = { l: 30, r: 10, t: 10, b: 18 };
  const n = attempts.length;
  const x = (i) => P.l + (n === 1 ? 0 : (i / (n - 1)) * (W - P.l - P.r));
  const y = (v) => H - P.b - (v / 20) * (H - P.t - P.b);
  const path = attempts.map((a, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(a.note20 ?? 0).toFixed(1)}`).join(" ");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Notes sur 20 des dernières séries">
    ${[0, 10, 20].map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${P.l - 4}" y="${y(t) + 3}" class="axis" text-anchor="end">${t}</text>`).join("")}
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(12)}" y2="${y(12)}" class="ref"/><text x="${W - P.r}" y="${y(12) - 3}" class="axis" text-anchor="end">seuil 12</text>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${attempts
      .map((a, i) => {
        const l = lessonById(a.lessonId);
        const s = l?.series.find((z) => z.id === a.seriesId);
        return `<g class="hit"><title>${formatDate(a.ts)} — ${escapeHtml(s?.title || a.seriesId)} : ${formatNote(a.note20)}/20${a.mode === "retry" ? " (erreurs)" : ""}</title>
          <circle cx="${x(i)}" cy="${y(a.note20 ?? 0)}" r="12" fill="transparent"/><circle cx="${x(i)}" cy="${y(a.note20 ?? 0)}" r="4.5" fill="${color}" stroke="var(--card)" stroke-width="2"/></g>`;
      })
      .join("")}
  </svg>`;
}

// ───────── blocs ─────────
function summaryCard(child, ov) {
  const lvl = levelOf(ov.xp);
  return `<div class="card summary" style="--c:${child.color}">
    <h2><span class="emblem">${child.emblem}</span> ${escapeHtml(child.name)}</h2>
    <div class="tiles">
      <div class="tile"><span class="tile-v">${ov.avgNote === null ? "–" : formatNote(ov.avgNote)}</span><span class="tile-l">moyenne /20</span></div>
      <div class="tile"><span class="tile-v">${formatDuration(ov.weekTimeMs)}</span><span class="tile-l">sur 7 jours</span></div>
      <div class="tile"><span class="tile-v">${formatDuration(ov.timeMs)}</span><span class="tile-l">au total</span></div>
      <div class="tile"><span class="tile-v">${ov.attempts}</span><span class="tile-l">séries faites</span></div>
      <div class="tile"><span class="tile-v">${ov.activeDays}</span><span class="tile-l">jours actifs</span></div>
      <div class="tile"><span class="tile-v">🔥 ${ov.streak}</span><span class="tile-l">jours d'affilée</span></div>
    </div>
    <p class="muted small">Niveau ${lvl.index} (${lvl.title}) · ${ov.xp} XP · dernière activité : ${ov.lastTs ? formatDate(ov.lastTs) : "jamais"}</p>
    <button type="button" class="btn ghost small goto" data-target="dash-${child.id}">Voir le détail ↓</button>
  </div>`;
}

function lessonsTable(child, records) {
  const rows = lessonsFor(child.id).map((l) => {
    const p = lessonProgress(l, records, child.id);
    const detail = l.series
      .map((s) => {
        const sm = p.series[s.id];
        return `<tr class="sub"><td>↳ ${rich(s.title)}</td><td>${sm.attempts ? noteBadge(sm.best) : "–"}</td><td>${sm.attempts ? `${formatNote(sm.last)}/20` : "–"}</td><td>${sm.attempts}</td><td>${sm.attempts ? formatDuration(sm.timeMs) : "–"}</td><td>${sm.lastTs ? formatDate(sm.lastTs) : "–"}</td></tr>`;
      })
      .join("");
    return `<tbody class="lesson-rows"><tr class="main"><td><strong>${l.icon} ${escapeHtml(l.title)}</strong><br><small class="muted">${escapeHtml(l.subject)} · <span class="pill status status-${p.status}">${STATUS_LABEL[p.status]}</span> · ${p.done}/${p.total} séries</small></td>
      <td>${noteBadge(p.note)}</td><td></td><td></td><td>${formatDuration(p.timeMs)}</td><td>${p.lastTs ? formatDate(p.lastTs) : "–"}</td></tr>${detail}</tbody>`;
  });
  return `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Leçon / série</th><th>Meilleure</th><th>Dernière</th><th>Essais</th><th>Temps</th><th>Dernière fois</th></tr></thead>${rows.join("")}</table></div>`;
}

function weakList(child, records) {
  const weak = weakQuestions(records, child.id);
  if (!weak.length) return `<p class="muted small">Aucune difficulté repérée pour l'instant.</p>`;
  return `<ul class="weak">${weak
    .map((w) => {
      const q = findQuestion(w.lessonId, w.qid);
      return `<li><div><span>${q ? rich(q.prompt) : escapeHtml(w.qid)}</span><small class="muted">Dernière réponse : « ${escapeHtml(String(w.lastGiven ?? "").slice(0, 140))} »</small></div>
        <span class="rate" title="Taux de réussite moyen sur ${w.tries} essai(s)">${Math.round(w.rate * 100)} %<small>${w.tries} essai${w.tries > 1 ? "s" : ""}</small></span></li>`;
    })
    .join("")}</ul>`;
}

function freeAnswers(child, records) {
  const list = [];
  for (const r of records) {
    if (r.type !== "attempt" || r.child !== child.id) continue;
    for (const a of r.answers || []) {
      const q = findQuestion(r.lessonId, a.qid);
      if (q?.type === "libre" && a.given) list.push({ r, a, q });
    }
  }
  if (!list.length) return `<p class="muted small">Pas encore de réponse libre.</p>`;
  return list
    .reverse()
    .slice(0, 12)
    .map(
      ({ r, a, q }) => `<article class="free-answer">
        <header><strong>${rich(q.prompt)}</strong><span>${formatNote(a.score)}/${a.max}</span></header>
        <blockquote>${escapeHtml(a.given)}</blockquote>
        <p class="muted small">${formatDate(r.ts)}${a.self ? ` · auto-évaluation : ${SELF[a.self] || a.self}` : ""}${a.hint ? " · coup de pouce utilisé" : ""}</p>
        ${a.ai ? `<p class="small"><strong>Correction IA :</strong> ${escapeHtml(a.ai)}</p>` : ""}
      </article>`,
    )
    .join("");
}

function journal(child, records) {
  const mine = records.filter((r) => r.child === child.id).slice(-20).reverse();
  if (!mine.length) return `<p class="muted small">Aucune activité enregistrée.</p>`;
  return `<ul class="journal">${mine
    .map((r) => {
      const l = lessonById(r.lessonId);
      if (r.type === "attempt") {
        const s = l?.series.find((z) => z.id === r.seriesId);
        return `<li><span class="j-date">${formatDate(r.ts)}</span><span>✏️ ${r.mode === "retry" ? "a refait ses erreurs de" : "a fait"} « ${escapeHtml(s?.title || r.seriesId)} » ${l ? `<small class="muted">(${escapeHtml(l.title)})</small>` : ""}</span><span class="j-end">${noteBadge(r.note20)} <small class="muted">${formatDuration(r.durationMs)}</small></span></li>`;
      }
      return `<li><span class="j-date">${formatDate(r.ts)}</span><span>👀 ${PAGE_LABEL[r.page] || "a navigué"} ${l ? `<small class="muted">(${escapeHtml(l.title)})</small>` : ""}</span><span class="j-end"><small class="muted">${formatDuration(r.durationMs)}</small></span></li>`;
    })
    .join("")}</ul>`;
}

export function renderDashboard(app, state) {
  const { records } = state;
  const overviews = CHILDREN.map((c) => ({ c, ov: childOverview(records, c.id) }));
  app.innerHTML = `
    ${topbar({ back: "#/", backLabel: "Accueil", title: "Espace parents" })}
    <main class="page dashboard">
      <header class="dash-head">
        <div><h1>Tableau de bord</h1><p class="muted small">${state.online ? `Données à jour (${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}), tous appareils confondus.` : "⚠️ Serveur injoignable : seules les données de cet appareil sont affichées."}</p></div>
        <button type="button" class="btn ghost small reload">↻ Actualiser</button>
      </header>
      <div class="summaries">${overviews.map(({ c, ov }) => summaryCard(c, ov)).join("")}</div>
      ${overviews
        .map(
          ({ c }) => `<section class="child-dash" id="dash-${c.id}" style="--c:${c.color}">
          <h2 class="child-dash-title"><span class="emblem">${c.emblem}</span> ${escapeHtml(c.name)}</h2>
          <div class="dash-grid">
            <div class="card"><h3>Temps d'activité (28 jours, minutes)</h3>${activityChart(dailyActivity(records, c.id), c.color)}</div>
            <div class="card"><h3>Notes des séries (/20)</h3>${notesChart(records.filter((r) => r.type === "attempt" && r.child === c.id).slice(-30), c.color)}</div>
          </div>
          <div class="card"><h3>Leçons</h3>${lessonsTable(c, records)}</div>
          <div class="dash-grid">
            <div class="card"><h3>🎯 Points faibles</h3>${weakList(c, records)}</div>
            <div class="card"><h3>🕘 Journal</h3>${journal(c, records)}</div>
          </div>
          <div class="card"><h3>✍️ Réponses libres</h3><div class="free-answers">${freeAnswers(c, records)}</div></div>
        </section>`,
        )
        .join("")}
      <p class="footnote muted small">Ce tableau de bord est ouvert (pas de mot de passe) pour le moment. Les données sont stockées dans Netlify Blobs.</p>
    </main>`;
  app.querySelectorAll(".goto").forEach((b) => b.addEventListener("click", () => document.getElementById(b.dataset.target).scrollIntoView({ behavior: "smooth" })));
  app.querySelector(".reload").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    await refresh();
    renderDashboard(app, state);
  });
}
