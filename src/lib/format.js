// Mini-balisage des contenus de leçon → HTML sûr.
//   **gras**, *italique*, 5^2 / 2^{10} / 10^{-3} (exposants), \n → <br>

export const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function rich(text = "") {
  return escapeHtml(text)
    .replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>")
    .replace(/\^(-?\d+)/g, "<sup>$1</sup>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}

export function formatDuration(ms = 0) {
  const min = Math.round(ms / 60000);
  if (min < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")}`;
}

const DAY = 86400000;
export function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()) - new Date(d.toDateString())) / DAY);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `aujourd'hui, ${time}`;
  if (diff === 1) return `hier, ${time}`;
  if (diff < 7) return `${d.toLocaleDateString("fr-FR", { weekday: "long" })}, ${time}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: diff > 300 ? "numeric" : undefined });
}

export const formatNote = (n) => (n === null || n === undefined ? "–" : String(n).replace(".", ","));

export const plural = (n, one, many = one + "s") => `${n} ${n > 1 ? many : one}`;
