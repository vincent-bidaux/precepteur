// Outils texte : normalisation tolérante (accents, casse, apostrophes) et
// comparaison « à une faute de frappe près » pour ne pas pénaliser l'orthographe.

export function norm(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/œ/g, "oe")
    .replace(/[^\p{L}\p{N}'+\-×÷^=()[\]., ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]+$/, "")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const tolerance = (len) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

// Articles en tête ignorés : « l'exposant » = « exposant »
const stripArticle = (s) => s.replace(/^(l'|le |la |les |un |une |des |du |de la |de l')\s*/, "");

/**
 * Compare une saisie à une liste de réponses acceptées.
 * → { ok, exact } ; exact=false si accepté à une faute d'orthographe près.
 */
export function matchText(input, accepted) {
  const n = stripArticle(norm(input));
  if (!n) return { ok: false, exact: false };
  let fuzzy = false;
  for (const a of accepted) {
    const t = stripArticle(norm(a));
    if (n === t) return { ok: true, exact: true };
    // tolérance proportionnelle à la longueur ; singulier/pluriel toléré
    if (levenshtein(n, t) <= tolerance(t.length) || n.replace(/s$/, "") === t.replace(/s$/, "")) fuzzy = true;
  }
  return { ok: fuzzy, exact: false };
}

/** Le texte contient-il ce mot-clé (ou une variante à une faute près) ? */
export function containsKeyword(text, keyword) {
  const t = norm(text);
  const k = norm(keyword);
  if (!k) return false;
  if (/^[\p{L}]/u.test(k) && /[\p{L}]$/u.test(k)) {
    // mot(s) entier(s) : évite que « carre » matche dans « carreau »… à peu près
    if (new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(t)) return true;
  } else if (t.includes(k)) return true;
  if (k.includes(" ") || k.length < 5) return false;
  return t.split(/[^\p{L}\p{N}]+/u).some((w) => w.length >= 4 && levenshtein(w, k) <= tolerance(k.length));
}

export function wordCount(s = "") {
  return String(s).trim().split(/\s+/).filter(Boolean).length;
}
