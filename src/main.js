// Point d'entrée : routeur par hash.
//
//   #/                                    accueil (dernier onglet enfant)
//   #/enfant/<id>                         accueil, onglet de l'enfant
//   #/enfant/<id>/lecon/<lecon>[/<onglet>] une leçon (reviser | entrainer | plus-loin)
//   #/enfant/<id>/lecon/<lecon>/serie/<s>  une série d'exercices
//   #/parent                              tableau de bord parent (suivi)
//   #/parent/lecons                       gestion des leçons (création avec Claude)
//   #/apercu/<lecon>[/<onglet>|/serie/<s>] aperçu parent d'une leçon
import "./styles.css";
import { CHILDREN, childById, PREVIEW_CHILD } from "./data/children.js";
import { lessonById } from "./catalog.js";
import { state, refresh } from "./app.js";
import { startVisit } from "./lib/visits.js";
import { lsGet, lsSet } from "./lib/storage.js";
import { renderHome } from "./ui/home.js";
import { renderLesson } from "./ui/lesson.js";
import { renderRunner } from "./ui/runner.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderLessonsAdmin } from "./ui/lessons-admin.js";
import { escapeHtml } from "./lib/format.js";

const app = document.getElementById("app");

// ───────── Routeur ─────────
let renderToken = 0;
async function route() {
  const token = ++renderToken;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  window.scrollTo(0, 0);

  if (!state.loaded) {
    app.innerHTML = `<div class="loading"><div class="spinner"></div><p>Le précepteur arrive…</p></div>`;
    await refresh();
    if (token !== renderToken) return;
  }

  if (parts[0] === "parent") {
    startVisit("parent", null);
    await refresh();
    if (token !== renderToken) return;
    setChildColors(PREVIEW_CHILD);
    return parts[1] === "lecons" ? renderLessonsAdmin(app, state) : renderDashboard(app, state);
  }

  // aperçu d'une leçon par un parent : même rendu, rien n'est enregistré
  if (parts[0] === "apercu") {
    const lesson = lessonById(parts[1]);
    if (!lesson) return notFound();
    setChildColors(PREVIEW_CHILD);
    startVisit(location.hash, null);
    return openLesson(PREVIEW_CHILD, lesson, parts.slice(2));
  }

  let child = parts[0] === "enfant" ? childById(parts[1]) : null;
  if (!child) child = childById(lsGet("precepteur:tab", CHILDREN[0].id)) || CHILDREN[0];
  lsSet("precepteur:tab", child.id);
  setChildColors(child);

  if (parts[2] === "lecon") {
    const lesson = lessonById(parts[3]);
    if (!lesson) return notFound();
    const rest = parts.slice(4);
    if (rest[0] === "serie") startVisit(location.hash, { page: "serie", lessonId: lesson.id, child: child.id });
    else startVisit(`lecon:${lesson.id}:${rest[0]}`, { page: rest[0] || "lecon", lessonId: lesson.id, child: child.id });
    return openLesson(child, lesson, rest);
  }

  startVisit(`home:${child.id}`, { page: "accueil", child: child.id });
  renderHome(app, { child, state });
}

function setChildColors(child) {
  document.documentElement.style.setProperty("--child", child.color);
  document.documentElement.style.setProperty("--child-soft", child.soft);
}

/** rest = [] | [onglet] | ["serie", id] */
function openLesson(child, lesson, rest) {
  if (rest[0] === "serie") {
    const series = lesson.series.find((s) => s.id === rest[1]);
    if (!series) return notFound();
    return renderRunner(app, { child, lesson, series, state });
  }
  const tab = ["reviser", "entrainer", "plus-loin"].includes(rest[0]) ? rest[0] : null;
  return renderLesson(app, { child, lesson, tab, state });
}

function notFound() {
  app.innerHTML = `<main class="page narrow"><div class="card empty"><h1>Page introuvable</h1><p>${escapeHtml("Cette page n'existe pas (ou plus).")}</p><a class="btn" href="#/">Retour à l'accueil</a></div></main>`;
}

window.addEventListener("hashchange", route);
route();
