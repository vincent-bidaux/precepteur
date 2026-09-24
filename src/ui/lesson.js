// Page d'une leçon : fiche de révision, séries d'exercices, « aller plus loin ».
import { lessonProgress, STATUS_LABEL } from "../lib/stats.js";
import { escapeHtml, rich, formatDate } from "../lib/format.js";
import { topbar, noteBadge, stars, progressBar } from "./common.js";

// ───────── Fiche de révision ─────────
function exemple(ex, key) {
  return `<div class="exemple" data-ex="${key}">
    <div class="ex-calc">${rich(ex.calc)}</div>
    <ol class="ex-steps">${ex.steps.map((s, i) => `<li class="ex-step" hidden data-i="${i}">${rich(s)}</li>`).join("")}</ol>
    <button class="btn ghost small ex-next" type="button">Voir l'étape suivante</button>
    ${ex.note ? `<p class="ex-note" hidden>💬 ${rich(ex.note)}</p>` : ""}
  </div>`;
}

function block(b, key) {
  switch (b.type) {
    case "p":
      return `<p>${rich(b.text)}</p>`;
    case "h":
      return `<h3 class="course-h">${rich(b.text)}</h3>`;
    case "retenir":
      return `<div class="callout retenir"><strong>📌 À retenir</strong><p>${rich(b.text)}</p></div>`;
    case "piege":
      return `<div class="callout piege"><strong>⚠️ Piège</strong><p>${rich(b.text)}</p></div>`;
    case "astuce":
      return `<div class="callout astuce"><strong>💡 Astuce</strong><p>${rich(b.text)}</p></div>`;
    case "table":
      return `<div class="table-wrap"><table class="stack"><thead><tr>${b.head.map((h) => `<th>${rich(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c, i) => `<td data-label="${escapeHtml(b.head[i])}">${rich(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
    case "schema":
      return `<div class="schema"><div class="schema-power"><span class="sp-base">${escapeHtml(b.base)}</span><sup class="sp-exp">${escapeHtml(b.exp)}</sup></div>
        <ul><li><span class="dot base"></span>${rich(b.baseLabel)}</li><li><span class="dot exp"></span>${rich(b.expLabel)}</li></ul></div>`;
    case "exemples":
      return `<div class="exemples">${b.items.map((ex, i) => exemple(ex, `${key}-${i}`)).join("")}</div>`;
    case "carres":
      return `<div class="carres"><h4>${rich(b.title)}</h4><div class="carres-grid">${b.items
        .map(([n, v]) => `<button type="button" class="carre" aria-label="${n} au carré"><span>${n}<sup>2</sup></span><b hidden>${v}</b></button>`)
        .join("")}</div><p class="muted small">Touche une case pour vérifier. Teste-toi avant de regarder !</p></div>`;
    case "etapes":
      return `<ol class="priorites">${b.items.map((it) => `<li><strong>${rich(it.title)}</strong>${it.text ? `<span>${rich(it.text)}</span>` : ""}</li>`).join("")}</ol>`;
    default:
      return "";
  }
}

function courseTab(lesson, child) {
  return `
    <section class="card">
      <h2>🎯 Ce que tu dois savoir faire</h2>
      <ul class="checks">${lesson.objectives.map((o) => `<li>${rich(o)}</li>`).join("")}</ul>
    </section>
    ${lesson.course
      .map(
        (sec) => `<section class="card course-section" id="c-${sec.id}">
          <h2>${rich(sec.title)}</h2>
          ${sec.blocks.map((b, i) => block(b, `${sec.id}-${i}`)).join("")}
        </section>`,
      )
      .join("")}
    ${lesson.manuel?.length ? `<section class="card"><h2>📚 Dans ton manuel</h2><ul>${lesson.manuel.map((m) => `<li>${rich(m)}</li>`).join("")}</ul></section>` : ""}
    <div class="cta-row"><a class="btn big" href="#/enfant/${child.id}/lecon/${lesson.id}/entrainer">J'ai révisé, je m'entraîne →</a></div>`;
}

// ───────── Séries ─────────
function seriesTab(lesson, child, p) {
  return `
    <section class="card overall">
      <div><h2>Ta note pour cette leçon</h2><p class="muted">Moyenne de tes meilleures notes sur chaque série. ${p.complete ? "" : "Fais toutes les séries pour valider la leçon !"}</p></div>
      ${noteBadge(p.note, { size: "big" })}
    </section>
    <div class="series-list">
      ${lesson.series
        .map((s, i) => {
          const sm = p.series[s.id];
          const nb = s.questions.length;
          return `<a class="series-card ${sm.attempts ? "done" : ""}" href="#/enfant/${child.id}/lecon/${lesson.id}/serie/${s.id}" data-series="${s.id}">
            <span class="series-num">${i + 1}</span>
            <span class="series-body"><strong>${rich(s.title)}</strong><small class="muted">${rich(s.intro)}</small>
              <small class="muted">${nb} questions${sm.attempts ? ` · ${sm.attempts} essai${sm.attempts > 1 ? "s" : ""} · dernier ${formatDate(sm.lastTs)}` : ""}</small></span>
            <span class="series-end">${sm.attempts ? `${stars(sm.best)}${noteBadge(sm.best)}<span class="btn ghost small">Refaire</span>` : `<span class="btn small">Go !</span>`}</span>
          </a>`;
        })
        .join("")}
    </div>`;
}

// ───────── Aller plus loin ─────────
function beyondTab(lesson) {
  const b = lesson.beyond;
  return `<p class="lead">${rich(b.intro)}</p>
    ${b.groups
      .map(
        (g) => `<section class="beyond-group">
          <h2>${g.icon} ${rich(g.title)}</h2>
          <div class="beyond-cards">
            ${g.cards
              .map(
                (c, i) => `<article class="card beyond-card">
                  <h3>${rich(c.title)}</h3>
                  <p>${rich(c.text)}</p>
                  ${c.quiz ? `<div class="mini-quiz" data-quiz="${g.id}-${i}"><p><strong>🧩 ${rich(c.quiz.prompt)}</strong></p><div class="mq-choices">${c.quiz.choices
                    .map((ch, j) => `<button type="button" class="chip" data-j="${j}">${rich(ch)}</button>`)
                    .join("")}</div><p class="mq-feedback" hidden></p></div>` : ""}
                </article>`,
              )
              .join("")}
          </div>
        </section>`,
      )
      .join("")}`;
}

export function renderLesson(app, { child, lesson, tab, state }) {
  const p = lessonProgress(lesson, state.records, child.id);
  const current = tab || (p.status === "nouveau" ? "reviser" : "entrainer");
  const base = `#/enfant/${child.id}/lecon/${lesson.id}`;
  const tabs = [
    ["reviser", "📖 Réviser"],
    ["entrainer", "✏️ S'entraîner"],
    ["plus-loin", "🔭 Plus loin"],
  ];

  app.innerHTML = `
    ${topbar({ back: `#/enfant/${child.id}`, backLabel: child.name })}
    <main class="page">
      <header class="lesson-head">
        <div class="lc-icon big">${lesson.icon}</div>
        <div>
          <div class="lc-meta"><span class="subject">${escapeHtml(lesson.subject)}</span><span class="pill status status-${p.status}">${STATUS_LABEL[p.status]}</span></div>
          <h1>${escapeHtml(lesson.title)}</h1>
          <p class="muted">${escapeHtml(lesson.subtitle)}</p>
          <div class="lc-progress">${progressBar(p.done / p.total, "Séries faites")}<span>${p.done}/${p.total} séries</span></div>
        </div>
      </header>
      <nav class="lesson-tabs" role="tablist">
        ${tabs.map(([id, label]) => `<a role="tab" aria-selected="${id === current}" class="${id === current ? "active" : ""}" href="${base}/${id}">${label}</a>`).join("")}
      </nav>
      <div class="lesson-body">
        ${current === "reviser" ? courseTab(lesson, child) : current === "entrainer" ? seriesTab(lesson, child, p) : beyondTab(lesson)}
      </div>
      ${lesson.source ? `<p class="footnote muted">Source : ${escapeHtml(lesson.source)}</p>` : ""}
    </main>`;

  // Exemples dévoilés étape par étape
  app.querySelectorAll(".exemple").forEach((ex) => {
    const btn = ex.querySelector(".ex-next");
    btn.addEventListener("click", () => {
      const next = ex.querySelector(".ex-step[hidden]");
      if (next) next.hidden = false;
      if (!ex.querySelector(".ex-step[hidden]")) {
        btn.remove();
        const note = ex.querySelector(".ex-note");
        if (note) note.hidden = false;
      } else btn.textContent = "Étape suivante";
    });
  });
  // Carrés à retourner
  app.querySelectorAll(".carre").forEach((c) =>
    c.addEventListener("click", () => {
      c.classList.toggle("flipped");
      c.querySelector("b").hidden = !c.classList.contains("flipped");
    }),
  );
  // Mini-quiz « le savais-tu »
  app.querySelectorAll(".mini-quiz").forEach((mq) => {
    const [gid, idx] = mq.dataset.quiz.split(/-(?=\d+$)/);
    const quiz = lesson.beyond.groups.find((g) => g.id === gid).cards[Number(idx)].quiz;
    mq.querySelectorAll(".chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        const ok = Number(chip.dataset.j) === quiz.answer;
        mq.querySelectorAll(".chip").forEach((c) => {
          c.disabled = true;
          if (Number(c.dataset.j) === quiz.answer) c.classList.add("right");
        });
        if (!ok) chip.classList.add("wrong");
        const fb = mq.querySelector(".mq-feedback");
        fb.hidden = false;
        fb.innerHTML = `${ok ? "✅ Exact !" : "❌ Pas tout à fait."} ${rich(quiz.explain)}`;
      }),
    );
  });
}
