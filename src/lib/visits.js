// Chronométrage des pages : seul le temps où la page est visible compte.
// Chaque visite de plus de 3 s devient un record « visit » dans le journal.
import { record, flush } from "./store.js";
import { addLocalRecord } from "../app.js";

const visit = { key: null, meta: null, activeMs: 0, since: null };

function pause() {
  if (visit.since !== null) {
    visit.activeMs += Date.now() - visit.since;
    visit.since = null;
  }
}
function resume() {
  if (visit.key && visit.since === null && document.visibilityState === "visible") visit.since = Date.now();
}
function close() {
  pause();
  if (visit.meta && visit.activeMs >= 3000) {
    addLocalRecord(record({ type: "visit", ...visit.meta, durationMs: Math.min(visit.activeMs, 3 * 3600000) }));
  }
  visit.key = null;
  visit.meta = null;
  visit.activeMs = 0;
}

/** Démarre le chronométrage d'une page (meta = null : page non suivie). */
export function startVisit(key, meta) {
  if (visit.key === key) return;
  close();
  visit.key = key;
  visit.meta = meta;
  visit.activeMs = 0;
  visit.since = null;
  resume();
}

/** Une série terminée compte déjà son temps dans son record : pas de visite en double. */
export function cancelVisit() {
  visit.meta = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    // on enregistre ce qui a été fait, puis on repart à zéro au retour
    const { key, meta } = visit;
    close();
    visit.key = key;
    visit.meta = meta;
  } else {
    resume();
  }
  flush();
});
window.addEventListener("pagehide", () => {
  close();
  flush();
});
window.addEventListener("online", () => flush());
