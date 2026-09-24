// Lanceur d'une série d'exercices : une question à la fois, correction
// immédiate et expliquée, puis note sur 20 enregistrée dans le journal.
import { gradeQuestion, earned, points, note20, HINT_FACTOR } from "../lib/grading.js";
import { escapeHtml, rich, formatDuration, formatNote } from "../lib/format.js";
import { record } from "../lib/store.js";
import { addLocalRecord, go } from "../app.js";
import { cancelVisit } from "../lib/visits.js";
import { seriesSummary } from "../lib/stats.js";
import { aiGradingOf } from "../catalog.js";
import { topbar, progressBar, noteBadge, stars, lessonUrl } from "./common.js";
import { confetti } from "./fx.js";

// ───────── utilitaires ─────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffledIndices(n) {
  const base = [...Array(n).keys()];
  if (n < 2) return base;
  let s;
  do s = shuffle(base);
  while (s.every((v, i) => v === i));
  return s;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Chronomètre qui ne compte que le temps où la page est visible. */
class Stopwatch {
  constructor() {
    this.total = 0;
    this.since = document.visibilityState === "visible" ? Date.now() : null;
  }
  pause() {
    if (this.since !== null) this.total += Date.now() - this.since;
    this.since = null;
  }
  resume() {
    if (this.since === null) this.since = Date.now();
  }
  get elapsed() {
    return this.total + (this.since !== null ? Date.now() - this.since : 0);
  }
}

const PRAISE = ["Bravo !", "Excellent !", "Parfait !", "Bien joué !", "Optime ! (« très bien » en latin)", "Impeccable !"];
const ALMOST = ["Presque !", "Pas loin !", "C'est en partie juste."];
const MISS = ["Pas tout à fait…", "Raté, mais on apprend !", "Oups !"];

// ───────── rendu des champs de réponse ─────────
function makeView(q) {
  if (q.type === "associer") return { right: shuffledIndices(q.pairs.length), pairing: {}, active: 0 };
  if (q.type === "ordre") return { order: shuffledIndices(q.items.length) };
  return {};
}

const KEYPAD = ["×", "÷", "+", "-", "(", ")", "[", "]", "²", "³", "^"];

function inputHtml(q, view) {
  switch (q.type) {
    case "qcm":
      return `<div class="choices" role="radiogroup">${q.choices
        .map((c, i) => `<button type="button" class="choice" role="radio" aria-checked="false" data-v="${i}"><span class="letter">${"ABCDEF"[i]}</span>${rich(c)}</button>`)
        .join("")}</div>`;
    case "vf":
      return `<div class="choices two" role="radiogroup"><button type="button" class="choice" role="radio" aria-checked="false" data-v="true">👍 Vrai</button><button type="button" class="choice" role="radio" aria-checked="false" data-v="false">👎 Faux</button></div>`;
    case "nombre":
      return `<label class="answer-line"><span class="sr-only">Ta réponse</span><input class="answer" type="text" inputmode="decimal" autocomplete="off" placeholder="Ta réponse" /></label>`;
    case "expression":
      return `<label class="answer-line"><span class="sr-only">Ton calcul</span><input class="answer expr" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(q.placeholder || "Ton calcul")}" /></label>
        ${q.keypad ? `<div class="keypad">${KEYPAD.map((k) => `<button type="button" class="key" data-k="${k}">${k === "^" ? "x<sup>n</sup>" : k}</button>`).join("")}<button type="button" class="key del" data-k="⌫" aria-label="Effacer">⌫</button></div>` : ""}`;
    case "trous": {
      const parts = rich(q.text).split(/\{(\d+)\}/);
      return `<p class="trous">${parts
        .map((p, i) => (i % 2 ? `<input class="blank" data-b="${p}" type="text" autocomplete="off" autocapitalize="off" aria-label="Case ${Number(p) + 1}" />` : p))
        .join("")}</p>`;
    }
    case "associer":
      return `<p class="muted small match-help">Touche la bonne réponse à droite pour l'élément surligné. Pour corriger, touche une case déjà reliée.</p><div class="match2">${matchHtml(q, view)}</div>`;
    case "ordre":
      return `<ol class="order-list">${orderItems(q, view)}</ol>`;
    case "etapes":
      return `<div class="steps">${q.steps
        .map((s, i) => `<label class="step-row"><span>${rich(s.label)}</span><input class="step" data-i="${i}" type="text" inputmode="decimal" autocomplete="off" /></label>`)
        .join("")}</div>`;
    case "libre":
      return `<textarea class="free" rows="5" placeholder="Écris ta réponse avec des phrases complètes…"></textarea><div class="free-meta muted small"><span class="wc">0 mot</span></div>`;
    default:
      return "";
  }
}

// Association « un toucher par paire » : l'élément actif à gauche est surligné ;
// toucher une réponse à droite les relie (même numéro, même couleur) et passe
// au suivant non relié. Toucher une case reliée la délie.
function matchHtml(q, view) {
  const owner = {}; // réponse de droite → élément de gauche relié
  for (const [l, r] of Object.entries(view.pairing)) owner[r] = Number(l);
  const left = q.pairs
    .map(([txt], i) => {
      const paired = view.pairing[i] !== undefined;
      return `<button type="button" class="m-tile m-left ${view.active === i ? "active" : ""} ${paired ? `paired c${i % 6}` : ""}" data-l="${i}" aria-pressed="${view.active === i}">
        <span class="m-badge">${paired ? i + 1 : ""}</span><span class="m-text">${rich(txt)}</span></button>`;
    })
    .join("");
  const right = view.right
    .map((j) => {
      const l = owner[j];
      return `<button type="button" class="m-tile m-right ${l !== undefined ? `paired c${l % 6}` : ""}" data-r="${j}">
        <span class="m-badge">${l !== undefined ? l + 1 : ""}</span><span class="m-text">${rich(q.pairs[j][1])}</span></button>`;
    })
    .join("");
  return `<div class="m-col">${left}</div><div class="m-col">${right}</div>`;
}

function matchTap(q, view, tile) {
  const n = q.pairs.length;
  const nextFree = (from) => {
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n;
      if (view.pairing[i] === undefined) return i;
    }
    return null;
  };
  if (tile.dataset.l !== undefined) {
    const i = Number(tile.dataset.l);
    if (view.active === i && view.pairing[i] !== undefined) delete view.pairing[i]; // 2e toucher : délie
    view.active = i;
    return;
  }
  const j = Number(tile.dataset.r);
  const holder = Object.keys(view.pairing).find((k) => view.pairing[k] === j);
  if (holder !== undefined) {
    // réponse déjà reliée : on la délie et on revient sur son élément
    delete view.pairing[holder];
    view.active = Number(holder);
    return;
  }
  if (view.active === null) view.active = nextFree(0);
  view.pairing[view.active] = j;
  view.active = nextFree(view.active + 1);
}

function orderItems(q, view) {
  return view.order
    .map(
      (orig, pos) => `<li class="order-item" data-orig="${orig}"><span class="order-pos">${pos + 1}</span><span class="order-text">${rich(q.items[orig])}</span>
        <span class="order-btns"><button type="button" class="key small up" data-pos="${pos}" aria-label="Monter" ${pos === 0 ? "disabled" : ""}>↑</button><button type="button" class="key small down" data-pos="${pos}" aria-label="Descendre" ${pos === view.order.length - 1 ? "disabled" : ""}>↓</button></span></li>`,
    )
    .join("");
}

function readAnswer(q, root, view) {
  switch (q.type) {
    case "qcm": {
      const sel = root.querySelector(".choice.selected");
      return sel ? Number(sel.dataset.v) : null;
    }
    case "vf": {
      const sel = root.querySelector(".choice.selected");
      return sel ? sel.dataset.v === "true" : null;
    }
    case "nombre":
    case "expression":
      return root.querySelector(".answer").value;
    case "trous":
      return [...root.querySelectorAll(".blank")].sort((a, b) => a.dataset.b - b.dataset.b).map((i) => i.value);
    case "associer":
      return Object.fromEntries(q.pairs.map((_, i) => [i, view.pairing[i] ?? null]));
    case "ordre":
      return [...view.order];
    case "etapes":
      return [...root.querySelectorAll(".step")].map((i) => i.value);
    case "libre":
      return root.querySelector(".free").value;
    default:
      return null;
  }
}

/** Réponse lisible (pour le tableau de bord parent). */
function describe(q, given) {
  switch (q.type) {
    case "qcm":
      return given === null ? "" : q.choices[given];
    case "vf":
      return given ? "Vrai" : "Faux";
    case "trous":
    case "etapes":
      return given.join(" | ");
    case "associer":
      return q.pairs.map(([l], i) => `${l} → ${given[i] === null || given[i] === undefined ? "?" : q.pairs[given[i]][1]}`).join(" ; ");
    case "ordre":
      return given.map((i) => q.items[i]).join(" → ");
    default:
      return String(given ?? "");
  }
}

function missingInput(q, given) {
  switch (q.type) {
    case "qcm":
    case "vf":
      return given === null ? "Choisis une réponse." : null;
    case "nombre":
    case "expression":
    case "libre":
      return String(given).trim() ? null : "Écris ta réponse d'abord.";
    case "trous":
    case "etapes":
      return given.some((v) => !String(v).trim()) ? "Complète toutes les cases." : null;
    case "associer":
      return Object.values(given).some((v) => v === null) ? "Associe chaque élément." : null;
    default:
      return null;
  }
}

const INVALID_MSG = {
  nombre: "Écris seulement un nombre (par exemple 42 ou 12,5).",
  calcul: "Écris seulement le résultat final, sans le calcul (par exemple 42).",
  expression: "Ce calcul n'est pas lisible : vérifie les parenthèses et les signes.",
  court: "Développe un peu plus ta réponse : fais au moins une phrase.",
};

// ───────── correction affichée ─────────
function correctionHtml(q, given, res) {
  switch (q.type) {
    case "qcm":
      return res.score === 1 ? "" : `<p>La bonne réponse : <strong>${rich(q.choices[q.answer])}</strong></p>`;
    case "vf":
      return res.score === 1 ? "" : `<p>La bonne réponse : <strong>${q.answer ? "Vrai" : "Faux"}</strong></p>`;
    case "nombre":
      return res.score === 1 ? "" : `<p>Réponse attendue : <strong>${formatNote([].concat(q.answer)[0])}</strong></p>`;
    case "expression":
      if (res.score === 1) return "";
      if (res.reason === "skeleton") return `<p>Ton calcul donne bien ${formatNote(res.value)}, mais il faut garder les nombres et les signes dans le même ordre, en ajoutant seulement des parenthèses.</p>`;
      if (res.reason === "mustUse") return `<p>Ton calcul donne bien ${formatNote(res.value)}, mais il doit utiliser les nombres de l'énoncé.</p>`;
      if (res.value !== undefined && res.value !== null) return `<p>Ton calcul donne ${formatNote(Math.round(res.value * 1000) / 1000)}.</p>`;
      return q.accept ? `<p>Réponse attendue : <strong>${rich(q.accept[0])}</strong></p>` : "";
    case "trous":
      return q.blanks.some((_, i) => !res.parts[i]) ? `<p>Les mots attendus : ${q.blanks.map((b) => `<strong>${escapeHtml(b.accept[0])}</strong>`).join(", ")}</p>` : res.spelling ? `<p>✍️ Attention à l'orthographe : ${q.blanks.map((b) => `<strong>${escapeHtml(b.accept[0])}</strong>`).join(", ")}</p>` : "";
    case "associer":
      return res.score === 1 ? "" : `<ul class="compact">${q.pairs.map(([l, r]) => `<li>${rich(l)} → <strong>${rich(r)}</strong></li>`).join("")}</ul>`;
    case "ordre":
      return res.score === 1 ? "" : `<p>Le bon ordre :</p><ol class="compact">${q.items.map((it) => `<li>${rich(it)}</li>`).join("")}</ol>`;
    case "etapes":
      return res.score === 1 ? "" : `<ul class="compact">${q.steps.map((s, i) => `<li class="${res.parts[i] ? "ok" : "ko"}">${rich(s.label)} <strong>${formatNote(s.answer)}</strong>${res.parts[i] ? " ✓" : ` <span class="muted">(tu as écrit ${escapeHtml(given[i] || "rien")})</span>`}</li>`).join("")}</ul>`;
    case "libre": {
      const ai = res.ai
        ? `<div class="ai-feedback"><strong>🎓 Le précepteur :</strong><p>${escapeHtml(res.ai)}</p></div>`
        : "";
      const ideas = `<ul class="ideas">${q.concepts
        .map((c) => {
          const ok = res.found?.includes(c.label);
          return `<li class="${ok ? "ok" : "ko"}">${ok ? "✅" : "⬜"} ${rich(c.label)}</li>`;
        })
        .join("")}</ul>`;
      return `${ai}<p><strong>Les idées attendues :</strong></p>${ideas}
        <details class="model" open><summary>Une réponse modèle</summary><p>${rich(q.model)}</p></details>
        <div class="self-eval"><p><strong>Et toi, comment juges-tu ta réponse ?</strong></p>
          <div class="chips"><button type="button" class="chip" data-self="tout">😎 J'avais tout</button><button type="button" class="chip" data-self="partie">🤔 En partie</button><button type="button" class="chip" data-self="rien">😅 Pas vraiment</button></div></div>`;
    }
    default:
      return "";
  }
}

async function gradeWithAI(lesson, series, q, text, child) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId: lesson.id, qid: `${series.id}/${q.id}`, answer: text, child: child.id }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ───────── la série ─────────
export function renderRunner(app, { child, lesson, series, state, questions, mode = "normal" }) {
  const qs = questions || series.questions;
  const backUrl = lessonUrl(child, lesson, "entrainer");
  const run = { i: 0, results: [], watch: new Stopwatch() };
  const onVis = () => (document.visibilityState === "visible" ? run.watch.resume() : run.watch.pause());
  document.addEventListener("visibilitychange", onVis);
  const cleanup = () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("hashchange", cleanup);
  };
  window.addEventListener("hashchange", cleanup);

  function showQuestion() {
    const q = qs[run.i];
    const view = makeView(q);
    const qStart = run.watch.elapsed;
    let usedHint = false;
    let validated = false;

    app.innerHTML = `
      ${topbar({ back: backUrl, backLabel: "Quitter", title: series.title })}
      <main class="page narrow runner">
        <div class="runner-head">
          <span class="muted">${mode === "retry" ? "🔁 On refait les erreurs · " : ""}Question ${run.i + 1} / ${qs.length}</span>
          <span class="pts muted">${points(q)} pt${points(q) > 1 ? "s" : ""}</span>
        </div>
        ${progressBar(run.i / qs.length, "Avancement de la série")}
        <section class="card question type-${q.type}">
          <h2 class="prompt">${rich(q.prompt)}</h2>
          <div class="input-zone">${inputHtml(q, view)}</div>
          <p class="invalid" role="alert" hidden></p>
          ${q.hint ? `<div class="hint" hidden>💡 ${rich(q.hint)}</div>` : ""}
          <div class="actions">
            ${q.hint ? `<button type="button" class="btn ghost hint-btn" title="Coûte un quart des points de la question">💡 Coup de pouce</button>` : ""}
            <button type="button" class="btn primary validate">Valider</button>
          </div>
        </section>
        <section class="feedback" hidden aria-live="assertive"></section>
      </main>`;

    const root = app.querySelector(".question");
    const firstInput = root.querySelector("input, textarea");
    if (firstInput && matchMedia("(pointer: fine)").matches) firstInput.focus();

    // choix exclusifs
    root.querySelectorAll(".choice").forEach((b) =>
      b.addEventListener("click", () => {
        if (validated) return;
        root.querySelectorAll(".choice").forEach((x) => {
          x.classList.toggle("selected", x === b);
          x.setAttribute("aria-checked", String(x === b));
        });
      }),
    );
    // association : toucher des cases
    root.querySelector(".match2")?.addEventListener("click", (e) => {
      const tile = e.target.closest(".m-tile");
      if (!tile || validated) return;
      matchTap(q, view, tile);
      root.querySelector(".match2").innerHTML = matchHtml(q, view);
    });
    // clavier mathématique
    root.querySelectorAll(".keypad .key").forEach((k) =>
      k.addEventListener("click", () => {
        const input = root.querySelector(".answer");
        const { selectionStart: s = input.value.length, selectionEnd: e = input.value.length } = input;
        if (k.dataset.k === "⌫") {
          const from = s === e ? Math.max(0, s - 1) : s;
          input.value = input.value.slice(0, from) + input.value.slice(e);
          input.setSelectionRange(from, from);
        } else {
          input.value = input.value.slice(0, s) + k.dataset.k + input.value.slice(e);
          input.setSelectionRange(s + k.dataset.k.length, s + k.dataset.k.length);
        }
        input.focus();
      }),
    );
    // ordre : monter / descendre
    const bindOrder = () =>
      root.querySelectorAll(".order-btns .key").forEach((b) =>
        b.addEventListener("click", () => {
          if (validated) return;
          const pos = Number(b.dataset.pos);
          const to = b.classList.contains("up") ? pos - 1 : pos + 1;
          [view.order[pos], view.order[to]] = [view.order[to], view.order[pos]];
          root.querySelector(".order-list").innerHTML = orderItems(q, view);
          bindOrder();
        }),
      );
    bindOrder();
    // compteur de mots
    const ta = root.querySelector(".free");
    if (ta) ta.addEventListener("input", () => {
      const n = ta.value.trim().split(/\s+/).filter(Boolean).length;
      root.querySelector(".wc").textContent = `${n} mot${n > 1 ? "s" : ""}`;
    });
    // coup de pouce
    root.querySelector(".hint-btn")?.addEventListener("click", (e) => {
      usedHint = true;
      root.querySelector(".hint").hidden = false;
      e.currentTarget.remove();
    });

    const validateBtn = root.querySelector(".validate");
    const invalidEl = root.querySelector(".invalid");

    async function validate() {
      if (validated) return;
      const given = readAnswer(q, root, view);
      const missing = missingInput(q, given);
      if (missing) {
        invalidEl.textContent = missing;
        invalidEl.hidden = false;
        return;
      }
      let res = gradeQuestion(q, given);
      if (res.invalid) {
        invalidEl.textContent = INVALID_MSG[res.invalid] || "Réponse illisible.";
        invalidEl.hidden = false;
        return;
      }
      validated = true;
      invalidEl.hidden = true;
      root.querySelectorAll("input, textarea, select, .choice, .key").forEach((el) => (el.disabled = true));
      root.querySelector(".actions").remove();

      if (q.type === "libre") {
        const fb = app.querySelector(".feedback");
        fb.hidden = false;
        fb.innerHTML = `<div class="card thinking"><div class="spinner small"></div> Le précepteur lit ta réponse…</div>`;
        const ai = aiGradingOf(lesson) ? await gradeWithAI(lesson, series, q, given, child) : null;
        if (ai && typeof ai.score === "number") res = { ...res, score: ai.score, ai: ai.feedback, found: ai.found?.length ? mapLabels(q, ai.found) : res.found };
      }
      showFeedback(q, given, res, usedHint, run.watch.elapsed - qStart, view);
    }
    validateBtn.addEventListener("click", validate);
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.target.tagName === "TEXTAREA" && !(e.ctrlKey || e.metaKey)) return;
      if (e.target.tagName === "BUTTON") return;
      e.preventDefault();
      validate();
    });
  }

  // l'IA renvoie des libellés : on garde ceux qui correspondent aux idées attendues
  function mapLabels(q, labels) {
    const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const set = new Set(labels.map(norm));
    return q.concepts.filter((c) => set.has(norm(c.label))).map((c) => c.label);
  }

  function showFeedback(q, given, res, usedHint, timeMs, view) {
    const max = points(q);
    const got = earned(q, res.score, usedHint);
    const entry = {
      qid: `${series.id}/${q.id}`,
      score: Math.round(got * 100) / 100,
      max,
      given: describe(q, given),
      hint: usedHint || undefined,
      timeMs: Math.round(timeMs),
      ai: res.ai,
    };
    run.results.push({ q, res, entry });

    // marquage visuel des réponses
    const root = app.querySelector(".question");
    if (q.type === "qcm" || q.type === "vf") {
      root.querySelectorAll(".choice").forEach((c) => {
        const v = q.type === "qcm" ? Number(c.dataset.v) : c.dataset.v === "true";
        if (v === q.answer) c.classList.add("right");
        else if (c.classList.contains("selected")) c.classList.add("wrong");
      });
    }
    if (q.type === "trous") root.querySelectorAll(".blank").forEach((b) => b.classList.add(res.parts[b.dataset.b] ? "right" : "wrong"));
    if (q.type === "etapes") root.querySelectorAll(".step").forEach((b) => b.classList.add(res.parts[b.dataset.i] ? "right" : "wrong"));
    if (q.type === "associer") {
      view.active = null;
      root.querySelector(".match2").innerHTML = matchHtml(q, view);
      root.querySelectorAll(".m-left").forEach((t) => t.classList.add(res.parts[t.dataset.l] ? "right" : "wrong"));
      root.querySelectorAll(".m-tile").forEach((t) => (t.disabled = true));
    }
    if (q.type === "nombre" || q.type === "expression") root.querySelector(".answer").classList.add(res.score === 1 ? "right" : "wrong");
    if (q.type === "ordre") root.querySelectorAll(".order-item").forEach((li, pos) => li.classList.add(Number(li.dataset.orig) === pos ? "right" : "wrong"));

    const verdict = res.score >= 0.999 ? "ok" : res.score >= 0.5 ? "mid" : "ko";
    const title = verdict === "ok" ? pick(PRAISE) : verdict === "mid" ? pick(ALMOST) : pick(MISS);
    const last = run.i === qs.length - 1;
    const fb = app.querySelector(".feedback");
    fb.hidden = false;
    fb.className = `feedback card verdict-${verdict}`;
    fb.innerHTML = `
      <div class="verdict"><span class="v-icon">${verdict === "ok" ? "✅" : verdict === "mid" ? "🟠" : "❌"}</span><strong>${escapeHtml(title)}</strong>
        <span class="v-pts">+${formatNote(Math.round(got * 100) / 100)} / ${max}${usedHint ? ` <small>(coup de pouce : ×${HINT_FACTOR})</small>` : ""}</span></div>
      ${correctionHtml(q, given, res)}
      <div class="explain"><strong>📖 L'explication</strong><p>${rich(q.explain)}</p></div>
      <div class="actions"><button type="button" class="btn primary next">${last ? "Voir mon résultat 🏁" : "Question suivante →"}</button></div>`;
    fb.querySelectorAll("[data-self]").forEach((b) =>
      b.addEventListener("click", () => {
        entry.self = b.dataset.self;
        fb.querySelectorAll("[data-self]").forEach((x) => x.classList.toggle("selected", x === b));
      }),
    );
    const next = fb.querySelector(".next");
    next.addEventListener("click", () => {
      run.i++;
      if (run.i < qs.length) showQuestion();
      else finish();
    });
    fb.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    next.focus({ preventScroll: true });
  }

  function finish() {
    run.watch.pause();
    cleanup();
    const score = run.results.reduce((s, r) => s + r.entry.score, 0);
    const max = run.results.reduce((s, r) => s + r.entry.max, 0);
    const n20 = note20(score, max);
    const before = seriesSummary(state.records, child.id, lesson.id, series.id);
    const rec = (child.preview ? (r) => ({ id: "apercu", ts: Date.now(), ...r }) : record)({
      type: "attempt",
      child: child.id,
      lessonId: lesson.id,
      seriesId: series.id,
      mode,
      durationMs: Math.round(run.watch.elapsed),
      score: Math.round(score * 100) / 100,
      max,
      note20: n20,
      answers: run.results.map((r) => r.entry),
    });
    if (!child.preview) addLocalRecord(rec);
    cancelVisit(); // le temps est déjà dans la tentative

    const misses = run.results.filter((r) => r.res.score < 0.999).map((r) => r.q);
    const xp = Math.round(n20 * 5) + (before.attempts === 0 && mode !== "retry" ? 20 : 0);
    const record_ = mode !== "retry" && before.best !== null && n20 > before.best;
    const idx = lesson.series.findIndex((s) => s.id === series.id);
    const nextSeries = lesson.series[idx + 1];
    const msg =
      n20 >= 18 ? "Magnifique ! Tu maîtrises ce sujet." : n20 >= 14 ? "Très bien ! Encore un petit effort pour la perfection." : n20 >= 10 ? "C'est un bon début. Relis les explications et retente ta chance !" : "Courage ! Relis la fiche de révision, puis refais la série : tu vas progresser.";

    app.innerHTML = `
      ${topbar({ back: backUrl, backLabel: "La leçon" })}
      <main class="page narrow runner">
        <section class="card result">
          <p class="muted">${escapeHtml(series.title)}${mode === "retry" ? " · on a refait les erreurs" : ""}</p>
          ${stars(n20)}
          <div class="result-note">${noteBadge(n20, { size: "huge" })}</div>
          <h1>${escapeHtml(msg)}</h1>
          <div class="result-stats">
            <span>⭐ +${xp} XP</span><span>⏱ ${formatDuration(run.watch.elapsed)}</span><span>✅ ${qs.length - misses.length}/${qs.length} parfaites</span>
            ${record_ ? `<span class="pill good">🏆 Nouveau record (avant : ${formatNote(before.best)})</span>` : ""}
          </div>
          ${mode === "retry" ? `<p class="muted small">Ce tour « erreurs » ne change pas ta note de série, mais il compte pour ton XP.</p>` : ""}
          <div class="actions wrap">
            ${misses.length ? `<button type="button" class="btn primary retry">🔁 Refaire mes ${misses.length} erreur${misses.length > 1 ? "s" : ""}</button>` : ""}
            ${nextSeries && mode !== "retry" ? `<a class="btn ${misses.length ? "" : "primary"}" href="${lessonUrl(child, lesson, `serie/${nextSeries.id}`)}">Série suivante →</a>` : ""}
            <button type="button" class="btn ghost again">Recommencer la série</button>
            <a class="btn ghost" href="${backUrl}">Retour à la leçon</a>
          </div>
        </section>
        <section class="card recap">
          <h2>Récapitulatif</h2>
          <ol class="recap-list">${run.results
            .map((r) => `<li class="${r.res.score >= 0.999 ? "ok" : r.res.score >= 0.5 ? "mid" : "ko"}"><span>${rich(r.q.prompt)}</span><b>${formatNote(r.entry.score)}/${r.entry.max}</b></li>`)
            .join("")}</ol>
        </section>
      </main>`;
    if (n20 >= 16) confetti();
    app.querySelector(".retry")?.addEventListener("click", () => renderRunner(app, { child, lesson, series, state, questions: misses, mode: "retry" }));
    app.querySelector(".again").addEventListener("click", () => go(lessonUrl(child, lesson, `serie/${series.id}`)));
  }

  showQuestion();
}
