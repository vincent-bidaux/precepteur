// Correction de chaque type de question. Toutes les fonctions sont pures :
// gradeQuestion(question, réponse) → { score 0..1, invalid?, parts?, spelling? }

import { matchText, containsKeyword, wordCount } from "./text.js";
import { normalizeExpr, tryEvaluate, sameNumber, parseNumber } from "./expr.js";

export const HINT_FACTOR = 0.75; // un coup de pouce plafonne la question à 75 %

const acceptedNumbers = (a) => (Array.isArray(a) ? a : [a]);

function gradeNumber(expected, given) {
  const v = parseNumber(given);
  if (v === null) return { score: 0, invalid: String(given ?? "").trim() !== "" && tryEvaluate(given) !== null ? "calcul" : "nombre" };
  return { score: acceptedNumbers(expected).some((e) => sameNumber(e, v)) ? 1 : 0 };
}

const stripBrackets = (s) => s.replace(/[()[\]]/g, "");

function gradeExpression(q, given) {
  const n = normalizeExpr(given);
  if (!n) return { score: 0, invalid: "vide" };
  if ((q.accept || []).some((a) => normalizeExpr(a) === n)) return { score: 1 };
  if (q.value !== undefined) {
    const v = tryEvaluate(n);
    if (v === null) return { score: 0, invalid: q.accept ? undefined : "expression" };
    if (!sameNumber(v, q.value)) return { score: 0, value: v };
    if (q.skeleton && stripBrackets(n) !== normalizeExpr(q.skeleton)) return { score: 0, value: v, reason: "skeleton" };
    if (q.mustUse) {
      const nums = (n.match(/\d+(\.\d+)?/g) || []).map(Number).sort((a, b) => a - b);
      const want = [...q.mustUse].sort((a, b) => a - b);
      if (nums.length !== want.length || nums.some((x, i) => !sameNumber(x, want[i]))) return { score: 0, value: v, reason: "mustUse" };
    }
    return { score: 1, value: v };
  }
  return { score: 0 };
}

function gradeBlanks(q, given = []) {
  let spelling = false;
  const parts = q.blanks.map((b, i) => {
    const m = matchText(given[i] ?? "", b.accept);
    if (m.ok && !m.exact) spelling = true;
    return m.ok ? 1 : 0;
  });
  return { score: parts.reduce((a, b) => a + b, 0) / parts.length, parts, spelling };
}

function gradeMatch(q, given = {}) {
  // given[i] = index (dans q.pairs) de la réponse associée à l'élément de gauche i
  const parts = q.pairs.map((_, i) => (Number(given[i]) === i ? 1 : 0));
  return { score: parts.reduce((a, b) => a + b, 0) / parts.length, parts };
}

function gradeOrder(q, given = []) {
  // given = indices d'origine dans l'ordre proposé par l'enfant
  const parts = q.items.map((_, i) => (given[i] === i ? 1 : 0));
  const exact = parts.every(Boolean);
  return { score: exact ? 1 : (parts.reduce((a, b) => a + b, 0) / parts.length) * 0.5, parts };
}

function gradeSteps(q, given = []) {
  const parts = q.steps.map((s, i) => gradeNumber(s.answer, given[i] ?? "").score);
  return { score: parts.reduce((a, b) => a + b, 0) / parts.length, parts };
}

/** Correction « hors ligne » d'une réponse libre : idées attendues repérées par mots-clés. */
export function gradeFree(q, given = "") {
  const text = String(given || "");
  if (wordCount(text) < (q.minWords ?? 3)) return { score: 0, invalid: "court", found: [], missing: q.concepts.map((c) => c.label) };
  const found = [];
  const missing = [];
  for (const c of q.concepts) (c.keywords.some((k) => containsKeyword(text, k)) ? found : missing).push(c.label);
  return { score: found.length / q.concepts.length, found, missing };
}

export function gradeQuestion(q, given) {
  switch (q.type) {
    case "qcm":
      return { score: Number(given) === q.answer ? 1 : 0 };
    case "vf":
      return { score: given === q.answer ? 1 : 0 };
    case "nombre":
      return gradeNumber(q.answer, given);
    case "expression":
      return gradeExpression(q, given);
    case "trous":
      return gradeBlanks(q, given);
    case "associer":
      return gradeMatch(q, given);
    case "ordre":
      return gradeOrder(q, given);
    case "etapes":
      return gradeSteps(q, given);
    case "libre":
      return gradeFree(q, given);
    default:
      throw new Error(`type de question inconnu : ${q.type}`);
  }
}

export const points = (q) => q.points ?? (q.type === "libre" ? 2 : 1);

/** Points obtenus pour une question, coup de pouce compris. */
export function earned(q, score, usedHint) {
  return points(q) * score * (usedHint ? HINT_FACTOR : 1);
}

/** Note sur 20, arrondie au demi-point. */
export function note20(score, max) {
  if (!max) return 0;
  return Math.round((score / max) * 40) / 2;
}
