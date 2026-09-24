// localStorage protégé : peut être indisponible (navigation privée, stockage
// bloqué) — l'app doit continuer de fonctionner sans.
export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou bloqué : tant pis, le serveur reste la référence */
  }
}
