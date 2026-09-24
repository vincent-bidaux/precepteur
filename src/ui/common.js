import { escapeHtml, formatNote } from "../lib/format.js";
import { state } from "../app.js";

export const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="var(--ink)"/><path d="M14 30c3-9 7-14 10-14s7 5 10 14" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/><path d="M11 22c2-6 7-10 13-10s11 4 13 10" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round" opacity=".55"/><circle cx="24" cy="31" r="3.2" fill="var(--gold)"/></svg>`;

export function topbar({ back, backLabel = "Accueil", title } = {}) {
  const offline = state.loaded && !state.online
    ? `<span class="pill warn" title="Tes résultats sont gardés sur cet appareil et seront envoyés dès que la connexion revient.">Hors ligne</span>`
    : "";
  return `<header class="topbar">
    <div class="topbar-in">
      ${back ? `<a class="back" href="${back}" aria-label="Retour">← <span>${escapeHtml(backLabel)}</span></a>` : `<a class="brand" href="#/">${LOGO}<span>Précepteur</span></a>`}
      ${title ? `<div class="topbar-title">${escapeHtml(title)}</div>` : ""}
      <div class="topbar-end">${offline}<a class="parent-link" href="#/parent" title="Tableau de bord parent">👪 <span>Parents</span></a></div>
    </div>
  </header>`;
}

export function noteBadge(note, { size = "" } = {}) {
  if (note === null || note === undefined) return `<span class="note-badge none ${size}">–</span>`;
  const cls = note >= 16 ? "great" : note >= 12 ? "good" : note >= 8 ? "mid" : "low";
  return `<span class="note-badge ${cls} ${size}">${formatNote(note)}<small>/20</small></span>`;
}

export function stars(note) {
  const n = note >= 16 ? 3 : note >= 12 ? 2 : note >= 8 ? 1 : 0;
  return `<span class="stars" aria-label="${n} étoile${n > 1 ? "s" : ""} sur 3">${[0, 1, 2].map((i) => `<span class="${i < n ? "on" : ""}">★</span>`).join("")}</span>`;
}

export function progressBar(ratio, label = "") {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(label)}"><span style="width:${pct}%"></span></div>`;
}
