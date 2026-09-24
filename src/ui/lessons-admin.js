// Espace parents › Leçons : créer une leçon avec Claude à partir de photos,
// choisir pour quel enfant est chaque leçon, publier / dépublier, supprimer.
import { CHILDREN, childById } from "../data/children.js";
import { allLessons, childrenOf, statusOf, loadCatalog } from "../catalog.js";
import { prepareImage } from "../lib/images.js";
import { collectText, extractJson, GenerationError } from "../lib/sse.js";
import { repairLesson, checkLesson } from "../lib/lesson-check.js";
import { lsGet, lsSet } from "../lib/storage.js";
import { escapeHtml, formatDate, formatDuration, plural } from "../lib/format.js";
import { topbar } from "./common.js";

const MAX_PHOTOS = 10;
const K_CODE = "precepteur:parent-code";
const EXPECTED_CHARS = 60000; // taille typique d'une leçon générée, pour la jauge

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
    <div class="al-controls">
      <fieldset class="kids"><legend class="muted small">Pour</legend>${childChecks(`kids-${l.id}`, kids)}</fieldset>
      <div class="al-actions">
        <a class="btn ghost small" href="#/apercu/${encodeURIComponent(l.id)}">👁️ Aperçu</a>
        <button type="button" class="btn small toggle-status">${status === "publiee" ? "Dépublier" : "✅ Publier"}</button>
        ${l.builtin ? "" : `<button type="button" class="btn ghost small danger delete">🗑️</button>`}
      </div>
    </div>
    <p class="al-msg small" aria-live="polite"></p>
  </article>`;
}

export function renderLessonsAdmin(app, state) {
  const photos = []; // { media_type, data, preview, name }
  let busy = false;

  const lessons = allLessons().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.addedAt).localeCompare(String(a.addedAt)));

  app.innerHTML = `
    ${topbar({ back: "#/", backLabel: "Accueil", title: "Espace parents" })}
    <main class="page dashboard">
      ${parentTabs("lecons")}
      <section class="card creator" id="creer">
        <h2>✨ Créer une leçon avec Claude</h2>
        <p class="muted">Prends en photo les pages de la leçon (cours, fiche, cahier), dans l'ordre. Claude en fait une fiche de révision expliquée, des séries d'exercices corrigés et une partie « Plus loin ». La leçon arrive en <strong>brouillon</strong> : tu la vérifies en aperçu, puis tu la publies.</p>
        <div class="photo-drop">
          <input type="file" id="photo-input" accept="image/*" multiple hidden />
          <button type="button" class="btn add-photos">📷 Ajouter des photos</button>
          <span class="muted small photo-count">Aucune photo (${MAX_PHOTOS} maximum)</span>
        </div>
        <div class="thumbs"></div>
        <label class="field"><span>Précisions pour Claude <small class="muted">(facultatif)</small></span>
          <textarea id="notes" rows="2" maxlength="2000" placeholder="Ex. : leçon de 5e sur la Révolution française ; insiste sur les dates ; contrôle vendredi."></textarea></label>
        <fieldset class="kids"><legend>Pour qui ?</legend>${childChecks("new-kids", CHILDREN.map((c) => c.id))}</fieldset>
        <div class="actions"><button type="button" class="btn primary generate" disabled>🪄 Générer la leçon</button></div>
        <div class="gen-status" hidden aria-live="polite"></div>
      </section>

      <section>
        <h2 class="section-title">📚 Toutes les leçons <span class="count">${lessons.length}</span></h2>
        <p class="muted small">Coche pour quel enfant est chaque leçon. Seules les leçons <strong>publiées</strong> apparaissent sur l'accueil des enfants.</p>
        <div class="admin-list">${lessons.map(lessonRow).join("")}</div>
      </section>
    </main>`;

  // ───────── photos ─────────
  const input = app.querySelector("#photo-input");
  const thumbs = app.querySelector(".thumbs");
  const genBtn = app.querySelector(".generate");
  const status = app.querySelector(".gen-status");

  function drawThumbs() {
    thumbs.innerHTML = photos
      .map(
        (p, i) => `<figure class="thumb"><img src="${p.preview}" alt="Photo ${i + 1}" /><figcaption>${i + 1}</figcaption>
          <div class="thumb-btns">${i > 0 ? `<button type="button" data-left="${i}" aria-label="Avancer">◀</button>` : ""}<button type="button" data-del="${i}" aria-label="Retirer">✕</button></div></figure>`,
      )
      .join("");
    app.querySelector(".photo-count").textContent = photos.length ? `${plural(photos.length, "photo")} (${MAX_PHOTOS} maximum)` : `Aucune photo (${MAX_PHOTOS} maximum)`;
    genBtn.disabled = busy || !photos.length;
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

  // ───────── génération ─────────
  genBtn.addEventListener("click", async () => {
    const kids = [...app.querySelectorAll('input[name="new-kids"]:checked')].map((i) => i.value);
    if (!kids.length) return showStatus(`<p class="error">Choisis au moins un enfant.</p>`);
    busy = true;
    genBtn.disabled = true;
    const t0 = Date.now();
    let phase = "envoi";
    let chars = 0;
    const tick = () => {
      const s = Math.round((Date.now() - t0) / 1000);
      const label =
        phase === "envoi" ? "Envoi des photos…" : phase === "reflexion" ? "Claude lit les photos et prépare la leçon…" : phase === "ecriture" ? "Claude écrit la leçon…" : phase === "verif" ? "Vérification des réponses…" : "Enregistrement…";
      const pct = phase === "ecriture" ? Math.min(95, 10 + (chars / EXPECTED_CHARS) * 85) : phase === "verif" || phase === "save" ? 98 : phase === "reflexion" ? 8 : 3;
      showStatus(`<div class="gen-progress"><div class="spinner small"></div><strong>${label}</strong> <span class="muted">${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}</span></div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <p class="muted small">Ça prend en général 1 à 4 minutes. Garde cette page ouverte.</p>`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    try {
      const res = await parentFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos.map(({ media_type, data }) => ({ media_type, data })), notes: app.querySelector("#notes").value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new GenerationError(err.error || `http_${res.status}`, errorMessage(err.error, res.status));
      }
      phase = "reflexion";
      const text = await collectText(res.body, (n, p) => {
        chars = n;
        phase = p;
      });
      phase = "verif";
      const { lesson, fixes } = repairLesson(extractJson(text));
      const { errors } = checkLesson(lesson);
      if (errors.length) throw new GenerationError("invalide", `La leçon générée est incomplète : ${errors.slice(0, 3).join(" ; ")}`);
      phase = "save";
      const saveRes = await parentFetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson, children: kids }),
      });
      const saved = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) throw new GenerationError(saved.error || "save", errorMessage(saved.error, saveRes.status, saved.errors));
      clearInterval(timer);
      await loadCatalog();
      renderLessonsAdmin(app, state);
      showCreated(app, saved, [...fixes, ...(saved.fixes || [])], Math.round((Date.now() - t0) / 1000));
    } catch (e) {
      clearInterval(timer);
      busy = false;
      genBtn.disabled = !photos.length;
      showStatus(`<p class="error">⚠️ ${escapeHtml(e.message || "Erreur inattendue.")}</p><p class="muted small">Tes photos sont toujours là : tu peux réessayer.</p>`);
    }
  });

  // ───────── liste des leçons ─────────
  app.querySelectorAll(".admin-lesson").forEach((row) => {
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
    row.querySelector(".toggle-status").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      const lesson = allLessons().find((l) => l.id === id);
      try {
        await put({ status: statusOf(lesson) === "publiee" ? "brouillon" : "publiee" });
        renderLessonsAdmin(app, state);
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
      renderLessonsAdmin(app, state);
    });
  });
}

function errorMessage(code, status, details) {
  switch (code) {
    case "ai_disabled":
      return "La création avec Claude n'est pas activée : ajoute la variable ANTHROPIC_API_KEY dans les réglages du site Netlify, puis redéploie.";
    case "code_parent":
      return "Code parent incorrect.";
    case "too_big":
      return "Les photos sont trop lourdes : retire-en quelques-unes.";
    case "rate_limited":
    case "http_429":
      return "Claude est très sollicité en ce moment : réessaie dans une minute.";
    case "lecon_invalide":
      return `La leçon générée est incomplète${details?.length ? ` : ${details.slice(0, 3).join(" ; ")}` : ""}.`;
    case "ai_error":
    case "ai_unreachable":
      return "Claude n'a pas pu traiter la demande. Réessaie dans un instant.";
    default:
      return `Erreur (${code || status}).`;
  }
}

function showCreated(app, saved, fixes, seconds) {
  const l = saved.lesson;
  const warnings = saved.warnings || [];
  const status = app.querySelector(".gen-status");
  status.hidden = false;
  status.innerHTML = `<div class="created">
    <h3>✅ « ${escapeHtml(l.title)} » est prête (brouillon)</h3>
    <p class="muted small">${plural(l.course.length, "section")} de fiche · ${plural(l.series.length, "série")} · ${plural(countQuestions(l), "question")} · générée en ${formatDuration(seconds * 1000)}</p>
    ${fixes.length || warnings.length ? `<details><summary>${plural(fixes.length + warnings.length, "remarque")} de vérification automatique</summary><ul class="small">${[...fixes.map((f) => `🔧 ${escapeHtml(f)}`), ...warnings.map((w) => `⚠️ ${escapeHtml(w)}`)].map((x) => `<li>${x}</li>`).join("")}</ul></details>` : `<p class="small ok">Vérification automatique : aucune anomalie.</p>`}
    <div class="actions wrap">
      <a class="btn primary" href="#/apercu/${encodeURIComponent(l.id)}">👁️ Voir l'aperçu</a>
      <button type="button" class="btn publish-new">✅ Publier maintenant</button>
    </div>
  </div>`;
  status.querySelector(".publish-new").addEventListener("click", () => app.querySelector(`.admin-lesson[data-id="${CSS.escape(l.id)}"] .toggle-status`)?.click());
  status.scrollIntoView({ block: "nearest" });
}
