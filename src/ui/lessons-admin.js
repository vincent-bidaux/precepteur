// Espace parents › Leçons : créer une leçon avec Claude (photos et/ou texte),
// en tâche de fond — la page peut être fermée —, choisir pour quel enfant est
// chaque leçon, publier / dépublier, supprimer.
import { CHILDREN, childById } from "../data/children.js";
import { allLessons, childrenOf, statusOf, loadCatalog, aiGradingOf, lessonCosts } from "../catalog.js";
import { MODELS, CREATION_MODELS, DEFAULT_CREATION_MODEL, GRADING_MODEL, estimateCreation, estimateGrading, formatUsd } from "../lib/pricing.js";
import { LENGTHS, DEFAULT_LENGTH, QUESTIONS, lengthInfo, seriesFor, minutesForQuestions } from "../lib/lesson-size.js";
import { prepareImage } from "../lib/images.js";
import { keepFormattingOnPaste } from "../lib/paste.js";
import { lsGet, lsSet } from "../lib/storage.js";
import { escapeHtml, formatDate, plural } from "../lib/format.js";
import { topbar } from "./common.js";

const MAX_PHOTOS = 10;
const MIN_TEXT = 20; // en dessous, sans photo, il n'y a pas de quoi construire une leçon
const MAX_TEXT = 12000;
const TEXT_EXAMPLE = `Ex. sans photo :
Histoire, 5e — Chapitre « L'émergence des royaumes chrétiens (XIe-XVe s.) »
1. La société féodale : seigneurs, vassaux, paysans
2. Le pouvoir royal s'affirme : Philippe Auguste, Saint Louis
3. L'Église encadre la société
Contrôle vendredi, insister sur les dates et le vocabulaire.

Ou simplement : « Programme de CM2 : les unités de mesure »`;
const K_CODE = "precepteur:parent-code";
const POLL_MS = 15000; // vérification des leçons en cours de création (modifiable pour les tests)

/** fetch pour les actions parent : ajoute le code parent si le serveur en demande un. */
export async function parentFetch(url, opts = {}, retry = true) {
  const headers = { ...(opts.headers || {}) };
  const code = lsGet(K_CODE, "");
  if (code) headers["x-parent-code"] = code;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 && retry) {
    const entered = window.prompt("Code parent :");
    if (entered) {
      lsSet(K_CODE, entered.trim());
      return parentFetch(url, opts, false);
    }
  }
  return res;
}

export function parentTabs(active) {
  return `<nav class="parent-tabs" role="tablist">
    <a role="tab" href="#/parent" class="${active === "suivi" ? "active" : ""}" aria-selected="${active === "suivi"}">📊 Suivi</a>
    <a role="tab" href="#/parent/lecons" class="${active === "lecons" ? "active" : ""}" aria-selected="${active === "lecons"}">📚 Leçons</a>
  </nav>`;
}

/** Interrupteur façon iOS (case à cocher accessible, rôle « switch »). */
export function iosSwitch(cls, on, label, hint = "") {
  return `<label class="ios-switch ${cls}"><input type="checkbox" role="switch" ${on ? "checked" : ""} /><span class="ios-track" aria-hidden="true"></span>
    <span class="ios-label"><strong>${label}</strong>${hint ? `<small class="muted">${hint}</small>` : ""}</span></label>`;
}

const AI_HINT_ON = () => {
  const c = estimateGrading();
  return `${c < 0.01 ? "Moins d'un centime" : `≈ ${formatUsd(c)}`} par réponse libre corrigée (${MODELS[GRADING_MODEL].label}).`;
};
const AI_HINT = () => `${AI_HINT_ON()} Désactivée : correction par mots-clés, aucun coût.`;

function costLine(l) {
  const c = lessonCosts(l);
  const parts = [];
  if (!l.builtin) parts.push(`création ${formatUsd(c.creation)}${c.model ? ` (${MODELS[c.model]?.label || c.model})` : ""}`);
  parts.push(c.graded ? `corrections IA ${formatUsd(c.grading)} (${plural(c.graded, "réponse")})` : "aucune correction IA pour l'instant");
  return `💶 ${parts.join(" · ")}`;
}

const countQuestions = (l) => l.series.reduce((n, s) => n + s.questions.length, 0);

function childChecks(name, selected) {
  return CHILDREN.map(
    (c) => `<label class="kid-check" style="--c:${c.color};--cs:${c.soft}"><input type="checkbox" name="${name}" value="${c.id}" ${selected.includes(c.id) ? "checked" : ""}/><span>${c.emblem} ${escapeHtml(c.name)}</span></label>`,
  ).join("");
}

function lessonRow(l) {
  const kids = childrenOf(l);
  const status = statusOf(l);
  return `<article class="admin-lesson card" data-id="${escapeHtml(l.id)}">
    <div class="al-head">
      <span class="lc-icon small">${escapeHtml(l.icon || "📘")}</span>
      <div class="al-title">
        <strong>${escapeHtml(l.title)}</strong>
        <small class="muted">${escapeHtml(l.subject)} · ${plural(l.series.length, "série")} · ${plural(countQuestions(l), "question")} · ${l.builtin ? "leçon intégrée" : `créée avec Claude${l.createdAt ? `, ${formatDate(l.createdAt)}` : ""}`}</small>
      </div>
      <span class="pill ${status === "publiee" ? "good" : "warn"} al-status">${status === "publiee" ? "Publiée" : "Brouillon"}</span>
    </div>
    <p class="small muted al-cost">${costLine(l)}</p>
    ${iosSwitch("ai-toggle", aiGradingOf(l), "Correction des réponses libres par l'IA", AI_HINT())}
    <div class="al-controls">
      <fieldset class="kids"><legend class="muted small">Pour</legend>${childChecks(`kids-${l.id}`, kids)}</fieldset>
      <div class="al-actions">
        <a class="btn ghost small" href="#/apercu/${encodeURIComponent(l.id)}">👁️ Aperçu</a>
        <button type="button" class="btn small toggle-status">${status === "publiee" ? "Dépublier" : "✅ Publier"}</button>
        ${l.builtin ? "" : `<button type="button" class="btn ghost small danger delete">🗑️</button>`}
      </div>
    </div>
    ${l.checkNotes?.length ? `<details class="small al-notes"><summary>${plural(l.checkNotes.length, "remarque")} de vérification automatique</summary><ul>${l.checkNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></details>` : ""}
    <p class="al-msg small" aria-live="polite"></p>
  </article>`;
}

function jobRow(job) {
  const kids = (job.children || []).map((k) => childById(k)?.name).filter(Boolean).join(" et ") || "personne";
  const failed = job.status === "echec";
  return `<article class="admin-lesson card job ${failed ? "failed" : ""}" data-job="${escapeHtml(job.id)}">
    <div class="al-head">
      <span class="lc-icon small">${failed ? "⚠️" : `<span class="spinner small" aria-hidden="true"></span>`}</span>
      <div class="al-title">
        <strong>${failed ? "Création échouée" : "Leçon en cours de création…"}</strong>
        <small class="muted">${escapeHtml(job.label || "")} · pour ${escapeHtml(kids)} · ${failed ? "" : "demandée "}${formatDate(job.createdAt)}</small>
        <small class="muted">${escapeHtml(MODELS[job.model]?.label || "")}${job.size ? ` · fiche ${lengthInfo(job.size.length).label.toLowerCase()} · ${job.size.questions} questions` : ""}${job.cost ? ` · coût ${formatUsd(job.cost)}` : ""}${job.aiGrading === false ? " · sans correction IA" : ""}</small>
      </div>
      <span class="pill ${failed ? "warn" : ""} al-status">${failed ? "Échec" : "En cours"}</span>
    </div>
    ${failed ? `<p class="error small">${escapeHtml(job.error || "")}</p>` : `<p class="muted small">Claude prépare la leçon : en général quelques minutes, parfois jusqu'à une heure. Tu peux fermer cette page, elle apparaîtra ici en brouillon.</p>`}
    <div class="al-actions">
      ${failed ? `<button type="button" class="btn small retry-job">🔁 Réessayer</button>` : ""}
      <button type="button" class="btn ghost small danger stop-job">${failed ? "🗑️ Supprimer" : "⏹ Arrêter la génération et supprimer"}</button>
    </div>
  </article>`;
}

export function renderLessonsAdmin(app, state) {
  const photos = []; // { media_type, data, preview, name }
  let busy = false;
  let jobs = [];
  let pollTimer = null;

  app.innerHTML = `
    ${topbar({ back: "#/", backLabel: "Accueil", title: "Espace parents" })}
    <main class="page dashboard">
      ${parentTabs("lecons")}
      <section class="card creator" id="creer">
        <h2>✨ Créer une leçon avec Claude</h2>
        <p class="muted">Pars de <strong>photos</strong> de la leçon (cours, fiche, cahier, dans l'ordre), d'un <strong>texte</strong> (plan de cours, partie du programme, notes), ou des deux. Claude en fait une fiche de révision expliquée, des séries d'exercices corrigés et une partie « Plus loin » ; s'il le faut, il consulte le programme officiel. La création se fait en arrière-plan : tu peux fermer la page. La leçon arrive en <strong>brouillon</strong> : tu la vérifies en aperçu, puis tu la publies.</p>
        <div class="photo-drop">
          <input type="file" id="photo-input" accept="image/*" multiple hidden />
          <button type="button" class="btn add-photos">📷 Ajouter des photos</button>
          <span class="muted small photo-count">Aucune photo (${MAX_PHOTOS} maximum)</span>
        </div>
        <div class="thumbs"></div>
        <label class="field"><span>Texte pour Claude <small class="muted">(obligatoire sans photo, sinon facultatif)</small></span>
          <textarea id="notes" rows="6" maxlength="${MAX_TEXT}" placeholder="${escapeHtml(TEXT_EXAMPLE)}"></textarea>
          <small class="muted text-help">Sans photo : un plan, ou juste la classe et le thème (« Programme de CM2 : les unités de mesure ») — Claude consulte le programme officiel et rédige tout le cours. Avec photos : précisions (niveau, date du contrôle, points à travailler). Le copier-coller depuis Word, Google Docs ou un site garde titres, listes et gras.</small></label>
        <fieldset class="kids"><legend>Pour qui ?</legend>${childChecks("new-kids", CHILDREN.map((c) => c.id))}</fieldset>

        <div class="sliders">
          <label class="slider"><span class="slider-top"><strong>📖 Longueur de la fiche</strong><output class="len-out"></output></span>
            <input type="range" id="len" min="1" max="${LENGTHS.length}" step="1" value="${DEFAULT_LENGTH}" /></label>
          <label class="slider"><span class="slider-top"><strong>✏️ Exercices</strong><output class="q-out"></output></span>
            <input type="range" id="nq" min="${QUESTIONS.min}" max="${QUESTIONS.max}" step="${QUESTIONS.step}" value="${QUESTIONS.default}" /></label>
        </div>

        <fieldset class="models"><legend>Modèle Claude pour créer la leçon</legend>
          ${CREATION_MODELS.map(
            (m) => `<label class="model-card"><input type="radio" name="model" value="${m}" ${m === DEFAULT_CREATION_MODEL ? "checked" : ""} />
              <span><strong>${MODELS[m].label}</strong>${m === DEFAULT_CREATION_MODEL ? ` <em class="pill good">recommandé</em>` : ""}<small class="muted">${MODELS[m].desc}</small><b class="model-cost" data-model="${m}"></b></span></label>`,
          ).join("")}
        </fieldset>
        ${iosSwitch("new-ai", true, "Correction des réponses libres par l'IA", AI_HINT())}
        <p class="muted small">Coûts estimés d'après les tarifs Anthropic (traitement différé, moitié prix). Le coût réel s'affiche ensuite sur chaque leçon.</p>

        <div class="actions"><button type="button" class="btn primary generate" disabled>🪄 Créer la leçon</button></div>
        <div class="gen-status" hidden aria-live="polite"></div>
      </section>

      <section>
        <h2 class="section-title">📚 Toutes les leçons <span class="count lesson-count"></span></h2>
        <p class="muted small">Coche pour quel enfant est chaque leçon. Seules les leçons <strong>publiées</strong> apparaissent sur l'accueil des enfants.</p>
        <div class="admin-list"></div>
      </section>
    </main>`;

  const input = app.querySelector("#photo-input");
  const thumbs = app.querySelector(".thumbs");
  const genBtn = app.querySelector(".generate");
  const status = app.querySelector(".gen-status");
  const notesEl = app.querySelector("#notes");
  const listEl = app.querySelector(".admin-list");
  const stillHere = () => document.body.contains(listEl);

  // ───────── formulaire ─────────
  const lenEl = app.querySelector("#len");
  const nqEl = app.querySelector("#nq");
  function updateSize() {
    const l = lengthInfo(lenEl.value);
    const n = Number(nqEl.value);
    app.querySelector(".len-out").textContent = `${l.label} — ${l.sections} sections, ≈ ${l.minutes} min de lecture`;
    app.querySelector(".q-out").textContent = `${n} questions en ${seriesFor(n)} séries — ≈ ${minutesForQuestions(n)} min`;
    app.querySelectorAll(".model-cost").forEach((b) => {
      b.textContent = `≈ ${formatUsd(estimateCreation(b.dataset.model, { photos: photos.length, length: l.level, questions: n }))} la leçon`;
    });
  }
  lenEl.addEventListener("input", updateSize);
  nqEl.addEventListener("input", updateSize);
  const hasContent = () => photos.length > 0 || notesEl.value.trim().length >= MIN_TEXT;
  const updateGenerate = () => (genBtn.disabled = busy || !hasContent());
  notesEl.addEventListener("input", updateGenerate);
  keepFormattingOnPaste(notesEl);

  function drawThumbs() {
    thumbs.innerHTML = photos
      .map(
        (p, i) => `<figure class="thumb"><img src="${p.preview}" alt="Photo ${i + 1}" /><figcaption>${i + 1}</figcaption>
          <div class="thumb-btns">${i > 0 ? `<button type="button" data-left="${i}" aria-label="Avancer">◀</button>` : ""}<button type="button" data-del="${i}" aria-label="Retirer">✕</button></div></figure>`,
      )
      .join("");
    updateSize();
    app.querySelector(".photo-count").textContent = photos.length ? `${plural(photos.length, "photo")} (${MAX_PHOTOS} maximum)` : `Aucune photo (${MAX_PHOTOS} maximum)`;
    updateGenerate();
  }
  thumbs.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    const left = e.target.closest("[data-left]");
    if (del) photos.splice(Number(del.dataset.del), 1);
    if (left) {
      const i = Number(left.dataset.left);
      [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
    }
    drawThumbs();
  });
  app.querySelector(".add-photos").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const files = [...input.files].slice(0, MAX_PHOTOS - photos.length);
    input.value = "";
    for (const f of files) {
      try {
        photos.push(await prepareImage(f));
      } catch (err) {
        showStatus(`<p class="error">${escapeHtml(err.message)}</p>`);
      }
      drawThumbs();
    }
  });
  function showStatus(html) {
    status.hidden = false;
    status.innerHTML = html;
  }

  genBtn.addEventListener("click", async () => {
    const kids = [...app.querySelectorAll('input[name="new-kids"]:checked')].map((i) => i.value);
    if (!kids.length) return showStatus(`<p class="error">Choisis au moins un enfant.</p>`);
    busy = true;
    updateGenerate();
    showStatus(`<div class="gen-progress"><div class="spinner small"></div><strong>Envoi de la demande…</strong></div>`);
    try {
      const res = await parentFetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: photos.map(({ media_type, data }) => ({ media_type, data })),
          notes: notesEl.value,
          children: kids,
          model: app.querySelector('input[name="model"]:checked').value,
          aiGrading: app.querySelector(".new-ai input").checked,
          size: { length: Number(lenEl.value), questions: Number(nqEl.value) },
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessage(out.error, res.status));
      photos.length = 0;
      notesEl.value = "";
      drawThumbs();
      showStatus(`<p class="ok"><strong>✅ C'est parti !</strong> Claude prépare la leçon en arrière-plan (en général quelques minutes). Tu peux fermer cette page : la leçon apparaîtra ci-dessous, en brouillon.</p>`);
      jobs = [out.job, ...jobs];
      drawList();
      schedulePoll();
    } catch (e) {
      showStatus(`<p class="error">⚠️ ${escapeHtml(e.message || "Erreur inattendue.")}</p><p class="muted small">Ta demande est toujours là : tu peux réessayer.</p>`);
    } finally {
      busy = false;
      updateGenerate();
    }
  });

  // ───────── liste : tâches en cours + leçons ─────────
  function drawList() {
    const lessons = allLessons().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.addedAt).localeCompare(String(a.addedAt)));
    app.querySelector(".lesson-count").textContent = String(lessons.length);
    listEl.innerHTML = jobs.map(jobRow).join("") + lessons.map(lessonRow).join("");
    bindJobs();
    bindLessons();
  }

  async function fetchJobs() {
    try {
      const res = await fetch("/api/jobs", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const before = jobs.map((j) => `${j.id}:${j.status}`).join();
      jobs = (await res.json()).jobs || [];
      const after = jobs.map((j) => `${j.id}:${j.status}`).join();
      if (before !== after) {
        await loadCatalog(); // une tâche terminée = une nouvelle leçon
        if (stillHere()) drawList();
      }
    } catch {
      /* hors ligne : on réessaiera */
    }
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!stillHere() || !jobs.some((j) => j.status !== "echec")) return;
    pollTimer = setTimeout(async () => {
      if (!stillHere()) return;
      await fetchJobs();
      schedulePoll();
    }, lsGet("precepteur:poll-ms", POLL_MS));
  }

  function bindJobs() {
    listEl.querySelectorAll("[data-job]").forEach((row) => {
      const id = row.dataset.job;
      row.querySelector(".stop-job").addEventListener("click", async (e) => {
        const job = jobs.find((j) => j.id === id);
        const question = job?.status === "echec" ? "Supprimer cette demande ?" : "Arrêter la génération de cette leçon et la supprimer ?";
        if (!window.confirm(question)) return;
        e.currentTarget.disabled = true;
        const res = await parentFetch(`/api/jobs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) {
          e.currentTarget.disabled = false;
          return;
        }
        jobs = jobs.filter((j) => j.id !== id);
        drawList();
      });
      row.querySelector(".retry-job")?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        const res = await parentFetch(`/api/jobs?id=${encodeURIComponent(id)}&action=retry`, { method: "POST" });
        const out = await res.json().catch(() => ({}));
        if (res.ok) jobs = jobs.map((j) => (j.id === id ? out.job : j));
        drawList();
        schedulePoll();
      });
    });
  }

  function bindLessons() {
    listEl.querySelectorAll(".admin-lesson[data-id]").forEach((row) => {
      const id = row.dataset.id;
      const msg = row.querySelector(".al-msg");
      const say = (t, ok = true) => {
        msg.textContent = t;
        msg.className = `al-msg small ${ok ? "ok" : "error"}`;
      };
      const put = async (patch) => {
        const res = await parentFetch(`/api/lessons?id=${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error();
        await loadCatalog();
      };
      row.querySelectorAll(".kids input").forEach((box) =>
        box.addEventListener("change", async () => {
          const kids = [...row.querySelectorAll(".kids input:checked")].map((i) => i.value);
          try {
            await put({ children: kids });
            say(kids.length ? `Enregistré ✓ — pour ${kids.map((k) => childById(k).name).join(" et ")}` : "Enregistré ✓ — attribuée à personne");
          } catch {
            box.checked = !box.checked;
            say("Échec de l'enregistrement, réessaie.", false);
          }
        }),
      );
      const aiBox = row.querySelector(".ai-toggle input");
      aiBox.addEventListener("change", async () => {
        try {
          await put({ aiGrading: aiBox.checked });
          say(aiBox.checked ? "Correction IA activée ✓" : "Correction IA désactivée ✓ — mots-clés seulement, aucun coût");
        } catch {
          aiBox.checked = !aiBox.checked;
          say("Échec de l'enregistrement, réessaie.", false);
        }
      });
      row.querySelector(".toggle-status").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        const lesson = allLessons().find((l) => l.id === id);
        try {
          await put({ status: statusOf(lesson) === "publiee" ? "brouillon" : "publiee" });
          drawList();
        } catch {
          e.currentTarget.disabled = false;
          say("Échec de l'enregistrement, réessaie.", false);
        }
      });
      row.querySelector(".delete")?.addEventListener("click", async () => {
        const lesson = allLessons().find((l) => l.id === id);
        if (!window.confirm(`Supprimer définitivement « ${lesson.title} » ? Les résultats déjà obtenus restent dans le journal.`)) return;
        const res = await parentFetch(`/api/lessons?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) return say("Échec de la suppression.", false);
        await loadCatalog();
        drawList();
      });
    });
  }

  updateSize();
  drawList();
  fetchJobs().then(() => {
    if (stillHere()) drawList();
    schedulePoll();
  });
}

function errorMessage(code, status) {
  switch (code) {
    case "ai_disabled":
      return "La création avec Claude n'est pas activée : ajoute la variable ANTHROPIC_API_KEY dans les réglages du site Netlify, puis redéploie.";
    case "code_parent":
      return "Code parent incorrect.";
    case "no_content":
      return "Ajoute au moins une photo, ou un texte d'une ou deux lignes (plan, partie du programme…).";
    case "too_big":
      return "Les photos sont trop lourdes : retire-en quelques-unes.";
    case "rate_limited":
      return "Claude est très sollicité en ce moment : réessaie dans une minute.";
    default:
      return `Erreur (${code || status}).`;
  }
}
