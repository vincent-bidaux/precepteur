// Accueil : un onglet par enfant ; répartition par matière, leçons à suivre,
// nouvelles, archivées (filtre par matière, tri par date), demande de leçon.
import { CHILDREN } from "../data/children.js";
import { lessonsFor, catalog, loadCatalog, childLevel } from "../catalog.js";
import { taughtSubjects } from "../data/subjects.js";
import { lessonProgress, childOverview, levelOf, STATUS_LABEL, isArchived, subjectBreakdown, withAllSubjects } from "../lib/stats.js";
import { escapeHtml, formatDate, formatDuration, formatNote, plural } from "../lib/format.js";
import { lsGet, lsSet } from "../lib/storage.js";
import { topbar, noteBadge, progressBar, subjectTag, bindArchive } from "./common.js";

const GREETINGS = ["Salve", "Ave", "Bonjour", "Salut"];

function greeting(child) {
  const h = new Date().getHours();
  const word = h < 5 || h >= 21 ? "Bonsoir" : GREETINGS[new Date().getDate() % GREETINGS.length];
  return `${word}, ${child.name} !`;
}

const archiveButton = (lesson, archived) =>
  `<button type="button" class="btn ghost small archive-btn" data-lesson="${escapeHtml(lesson.id)}" data-archived="${archived}" title="${archived ? "Remettre dans mes leçons" : "Ranger dans les leçons archivées"}">${archived ? "📤 Ressortir" : "🗄️ Archiver"}</button>`;

function lessonCard(child, { lesson, p }) {
  const href = `#/enfant/${child.id}/lecon/${lesson.id}`;
  const cta = p.status === "nouveau" ? "Commencer" : p.status === "en-cours" ? "Continuer" : p.status === "a-revoir" ? "Retravailler" : "Revoir";
  return `<article class="lesson-card status-${p.status}" data-lesson="${lesson.id}">
    <a class="lc-link" href="${href}" aria-label="${escapeHtml(lesson.title)}"></a>
    <div class="lc-icon">${lesson.icon}</div>
    <div class="lc-body">
      <div class="lc-meta">${subjectTag(lesson)}<span class="pill status">${STATUS_LABEL[p.status]}</span></div>
      <h3>${escapeHtml(lesson.title)}</h3>
      <p class="muted">${escapeHtml(lesson.subtitle || "")}</p>
      <div class="lc-progress">${progressBar(p.done / p.total, "Séries faites")}<span>${p.done}/${p.total} séries</span></div>
    </div>
    <div class="lc-end">${p.note !== null ? noteBadge(p.note) : ""}${archiveButton(lesson, false)}<a class="btn small" href="${href}">${cta} →</a></div>
  </article>`;
}

function archivedRow(child, { lesson, p }) {
  return `<div class="past-row" data-lesson="${lesson.id}">
    <a class="lc-link" href="#/enfant/${child.id}/lecon/${lesson.id}" aria-label="${escapeHtml(lesson.title)}"></a>
    <span class="lc-icon small">${lesson.icon}</span>
    <span class="pr-title">${subjectTag(lesson, { short: true })}<strong>${escapeHtml(lesson.title)}</strong><small class="muted">${p.lastTs ? formatDate(p.lastTs) : ""}</small></span>
    ${noteBadge(p.note)}${archiveButton(lesson, true)}
  </div>`;
}

function subjectsCard(child, rows) {
  const level = childLevel(child.id);
  const empty = rows.filter((r) => !r.count);
  return `<section class="card subjects-card" id="matieres">
    <h2>📚 Mes matières${level ? ` <small class="muted">· ${escapeHtml(level)}</small>` : ""}</h2>
    <div class="subject-rows">${rows
      .filter((r) => r.count)
      .map(
        (r) => `<div class="subject-row">
          <span class="sr-icon">${r.subject.icon}</span>
          <span class="sr-main"><strong>${escapeHtml(r.label)}</strong>
            <small class="muted">${plural(r.count, "leçon")}${r.nouveau ? ` · ${r.nouveau} nouvelle${r.nouveau > 1 ? "s" : ""}` : ""}${r.enCours ? ` · ${r.enCours} à suivre` : ""}${r.reussies ? ` · ${r.reussies} réussie${r.reussies > 1 ? "s" : ""}` : ""}${r.archivees ? ` · ${r.archivees} archivée${r.archivees > 1 ? "s" : ""}` : ""}</small>
            ${progressBar(r.completion, `Avancement en ${r.label}`)}</span>
          <span class="sr-end">${noteBadge(r.avg)}<small class="muted">${Math.round(r.completion * 100)} % fait</small></span>
        </div>`,
      )
      .join("")}</div>
    ${
      empty.length
        ? `<p class="muted small sr-empty-title">Pas encore de leçon dans ${empty.length > 1 ? "ces matières" : "cette matière"} — touche-en une pour demander une leçon :</p>
      <div class="subject-empty">${empty.map((r) => `<button type="button" class="chip ask-subject" data-label="${escapeHtml(r.label)}">${r.subject.icon} ${escapeHtml(r.subject.short || r.label)}${r.subject.option ? ` <small class="muted">(option)</small>` : ""}</button>`).join("")}</div>`
        : ""
    }
  </section>`;
}

function requestCard(child) {
  const mine = (catalog.requests || []).filter((r) => r.child === child.id);
  return `<section class="card request-card" id="demande">
    <h2>📬 Demander une leçon</h2>
    <p class="muted small">Un contrôle qui arrive, un chapitre à revoir ? Écris-le ici : tes parents pourront créer la leçon.</p>
    <textarea id="request-text" rows="2" maxlength="1000" placeholder="Ex. : Histoire, les châteaux forts — contrôle jeudi"></textarea>
    <div class="actions"><button type="button" class="btn primary send-request" disabled>Envoyer la demande</button></div>
    <p class="request-msg small" aria-live="polite"></p>
    ${mine.length ? `<ul class="my-requests small">${mine.map((r) => `<li>⏳ « ${escapeHtml(r.text)} » <span class="muted">— ${formatDate(r.createdAt)}</span></li>`).join("")}</ul>` : ""}
  </section>`;
}

export function renderHome(app, { child, state }) {
  const prefs = { subject: "", sort: "recent", ...lsGet(`precepteur:home:${child.id}`, {}) };
  const all = lessonsFor(child.id).map((l) => ({ lesson: l, p: lessonProgress(l, state.records, child.id), archived: isArchived(state.records, child.id, l.id) }));
  const subjects = subjectBreakdown(all);
  if (prefs.subject && !subjects.some((r) => r.subject.id === prefs.subject)) prefs.subject = "";
  const dateOf = (x) => x.p.lastTs || Date.parse(x.lesson.addedAt) || 0;
  const visible = all
    .filter((x) => !prefs.subject || x.lesson.subjectInfo?.id === prefs.subject)
    .sort((a, b) => (prefs.sort === "recent" ? dateOf(b) - dateOf(a) : dateOf(a) - dateOf(b)));
  const todo = visible.filter((x) => !x.archived && x.p.status !== "nouveau");
  const fresh = visible.filter((x) => !x.archived && x.p.status === "nouveau");
  const archived = visible.filter((x) => x.archived);
  const ov = childOverview(state.records, child.id);
  const lvl = levelOf(ov.xp);

  const section = (id, title, items, empty, render) => `
    <section class="home-section" id="${id}">
      <h2>${title} ${items.length ? `<span class="count">${items.length}</span>` : ""}</h2>
      ${items.length ? `<div class="${id === "archivees" ? "past-list card" : "cards"}">${items.map(render).join("")}</div>` : `<p class="empty-line">${empty}</p>`}
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

      ${subjectsCard(child, withAllSubjects(subjects, taughtSubjects(childLevel(child.id) ? [childLevel(child.id)] : [])))}

      <div class="list-tools" role="toolbar" aria-label="Filtrer et trier">
        <div class="chips filter-chips">
          <button type="button" class="chip ${prefs.subject ? "" : "selected"}" data-subject="">Toutes</button>
          ${subjects.map((r) => `<button type="button" class="chip ${prefs.subject === r.subject.id ? "selected" : ""}" data-subject="${r.subject.id}">${r.subject.icon} ${escapeHtml(r.subject.short || r.label)}</button>`).join("")}
        </div>
        <button type="button" class="chip sort-btn" data-sort="${prefs.sort}">${prefs.sort === "recent" ? "↓ Plus récentes d'abord" : "↑ Plus anciennes d'abord"}</button>
      </div>

      ${section("a-suivre", "📌 À suivre", todo, fresh.length ? "Rien en cours : choisis une nouvelle leçon ci-dessous !" : "Rien en cours. Bravo !", (x) => lessonCard(child, x))}
      ${section("nouveau", "✨ Nouveau", fresh, "Pas de nouvelle leçon pour l'instant.", (x) => lessonCard(child, x))}
      ${section("archivees", "🗄️ Leçons archivées", archived, "Range ici les leçons que tu as finies avec le bouton « Archiver ».", (x) => archivedRow(child, x))}

      ${requestCard(child)}

      <p class="footnote muted">${plural(all.length, "leçon")} · ${plural(ov.attempts, "série terminée", "séries terminées")} au total</p>
    </main>`;

  const rerender = () => renderHome(app, { child, state });
  const save = (patch) => lsSet(`precepteur:home:${child.id}`, { ...prefs, ...patch });
  app.querySelectorAll(".filter-chips .chip").forEach((b) =>
    b.addEventListener("click", () => {
      save({ subject: b.dataset.subject });
      rerender();
    }),
  );
  app.querySelector(".sort-btn").addEventListener("click", () => {
    save({ sort: prefs.sort === "recent" ? "ancien" : "recent" });
    rerender();
  });
  bindArchive(app, child, rerender);

  const text = app.querySelector("#request-text");
  const send = app.querySelector(".send-request");
  const msg = app.querySelector(".request-msg");
  text.addEventListener("input", () => (send.disabled = text.value.trim().length < 3));
  // matière sans leçon → demande pré-remplie
  app.querySelectorAll(".ask-subject").forEach((b) =>
    b.addEventListener("click", () => {
      text.value = `${b.dataset.label} : `;
      send.disabled = true;
      app.querySelector("#demande").scrollIntoView({ block: "center" });
      text.focus();
      text.setSelectionRange(text.value.length, text.value.length);
    }),
  );
  send.addEventListener("click", async () => {
    send.disabled = true;
    try {
      const res = await fetch("/api/lessons?action=request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ child: child.id, text: text.value }),
      });
      if (!res.ok) throw new Error();
      await loadCatalog();
      rerender();
      app.querySelector(".request-msg").textContent = "✅ Demande envoyée à tes parents !";
    } catch {
      msg.textContent = "Impossible d'envoyer la demande pour l'instant, réessaie plus tard.";
      msg.className = "request-msg small error";
      send.disabled = false;
    }
  });
}
