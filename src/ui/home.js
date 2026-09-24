// Accueil : un onglet par enfant ; leçons à suivre, nouvelles, puis passées.
import { CHILDREN } from "../data/children.js";
import { lessonsFor } from "../catalog.js";
import { lessonProgress, childOverview, levelOf, STATUS_LABEL } from "../lib/stats.js";
import { escapeHtml, formatDate, formatDuration, plural } from "../lib/format.js";
import { topbar, noteBadge, progressBar } from "./common.js";

const GREETINGS = ["Salve", "Ave", "Bonjour", "Salut"];

function greeting(child) {
  const h = new Date().getHours();
  const word = h < 5 || h >= 21 ? "Bonsoir" : GREETINGS[new Date().getDate() % GREETINGS.length];
  return `${word}, ${child.name} !`;
}

function lessonCard(child, lesson, p) {
  const href = `#/enfant/${child.id}/lecon/${lesson.id}`;
  const cta = p.status === "nouveau" ? "Commencer" : p.status === "en-cours" ? "Continuer" : p.status === "a-revoir" ? "Retravailler" : "Revoir";
  return `<a class="lesson-card status-${p.status}" href="${href}" data-lesson="${lesson.id}">
    <div class="lc-icon">${lesson.icon}</div>
    <div class="lc-body">
      <div class="lc-meta"><span class="subject">${escapeHtml(lesson.subject)}</span><span class="pill status">${STATUS_LABEL[p.status]}</span></div>
      <h3>${escapeHtml(lesson.title)}</h3>
      <p class="muted">${escapeHtml(lesson.subtitle)}</p>
      <div class="lc-progress">${progressBar(p.done / p.total, "Séries faites")}<span>${p.done}/${p.total} séries</span></div>
    </div>
    <div class="lc-end">${p.note !== null ? noteBadge(p.note) : ""}<span class="btn small">${cta} →</span></div>
  </a>`;
}

function pastRow(child, lesson, p) {
  return `<a class="past-row" href="#/enfant/${child.id}/lecon/${lesson.id}" data-lesson="${lesson.id}">
    <span class="lc-icon small">${lesson.icon}</span>
    <span class="pr-title"><strong>${escapeHtml(lesson.title)}</strong><small class="muted">${escapeHtml(lesson.subject)} · ${p.lastTs ? formatDate(p.lastTs) : ""}</small></span>
    ${noteBadge(p.note)}
  </a>`;
}

export function renderHome(app, { child, state }) {
  const lessons = lessonsFor(child.id).map((l) => ({ lesson: l, p: lessonProgress(l, state.records, child.id) }));
  const todo = lessons.filter((x) => x.p.status === "en-cours" || x.p.status === "a-revoir").sort((a, b) => (b.p.lastTs || 0) - (a.p.lastTs || 0));
  const fresh = lessons.filter((x) => x.p.status === "nouveau");
  const past = lessons.filter((x) => x.p.status === "maitrise").sort((a, b) => (b.p.lastTs || 0) - (a.p.lastTs || 0));
  const ov = childOverview(state.records, child.id);
  const lvl = levelOf(ov.xp);

  const section = (id, title, items, empty, render = (x) => lessonCard(child, x.lesson, x.p)) => `
    <section class="home-section" id="${id}">
      <h2>${title} ${items.length ? `<span class="count">${items.length}</span>` : ""}</h2>
      ${items.length ? `<div class="${id === "passees" ? "past-list card" : "cards"}">${items.map(render).join("")}</div>` : `<p class="empty-line">${empty}</p>`}
    </section>`;

  app.innerHTML = `
    ${topbar()}
    <main class="page">
      <nav class="child-tabs" role="tablist" aria-label="Choisir l'enfant">
        ${CHILDREN.map((c) => `<a role="tab" class="child-tab ${c.id === child.id ? "active" : ""}" aria-selected="${c.id === child.id}" href="#/enfant/${c.id}" style="--c:${c.color};--cs:${c.soft}"><span class="emblem">${c.emblem}</span>${escapeHtml(c.name)}</a>`).join("")}
      </nav>

      <section class="hero card">
        <div class="hero-text">
          <h1>${escapeHtml(greeting(child))}</h1>
          <p class="motto">« ${escapeHtml(child.motto)} »</p>
        </div>
        <div class="hero-stats">
          <div class="stat" title="Jours d'affilée avec au moins une activité"><span class="stat-v">🔥 ${ov.streak}</span><span class="stat-l">${ov.streak > 1 ? "jours d'affilée" : "jour d'affilée"}</span></div>
          <div class="stat"><span class="stat-v">⭐ ${ov.xp}</span><span class="stat-l">points d'XP</span></div>
          <div class="stat"><span class="stat-v">⏱ ${formatDuration(ov.weekTimeMs)}</span><span class="stat-l">cette semaine</span></div>
        </div>
        <div class="level">
          <div class="level-top"><span>Niveau ${lvl.index} · <strong>${lvl.title}</strong> <small class="muted">(${lvl.desc})</small></span>${lvl.next ? `<small class="muted">encore ${lvl.next.xp - ov.xp} XP → ${lvl.next.title}</small>` : ""}</div>
          ${progressBar(lvl.progress, "Progression vers le niveau suivant")}
        </div>
      </section>

      ${section("a-suivre", "📌 À suivre", todo, fresh.length ? "Rien en cours : choisis une nouvelle leçon ci-dessous !" : "Rien en cours. Bravo !")}
      ${section("nouveau", "✨ Nouveau", fresh, "Pas de nouvelle leçon pour l'instant.")}
      ${section("passees", "🏛️ Leçons passées", past, "Les leçons réussies apparaîtront ici, avec ta note.", (x) => pastRow(child, x.lesson, x.p))}

      <p class="footnote muted">${plural(lessons.length, "leçon")} · ${plural(ov.attempts, "série terminée", "séries terminées")} au total</p>
    </main>`;
}
