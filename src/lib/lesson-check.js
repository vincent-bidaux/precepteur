// Contrôle et réparation d'une leçon (écrite à la main ou générée par Claude).
//
//   repairLesson(l)  → copie nettoyée : identifiants uniques, questions
//                      invalides retirées, résultats de calcul recalculés.
//   checkLesson(l)   → { errors, warnings } ; errors = leçon inutilisable.
//
// Utilisé par les tests (leçons intégrées), par le serveur (avant
// d'enregistrer une leçon) et par l'espace parents (aperçu des alertes).
import { gradeQuestion, gradeFree } from "./grading.js";
import { tryEvaluate, sameNumber } from "./expr.js";

export const QUESTION_TYPES = ["qcm", "vf", "nombre", "expression", "trous", "associer", "ordre", "etapes", "libre"];
export const BLOCK_TYPES = ["p", "h", "retenir", "piege", "astuce", "definition", "liste", "table", "schema", "exemples", "carres", "etapes"];

const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

/** « Calcule X = 3 + 4^2. » → valeur calculée, ou null si l'énoncé n'est pas un pur calcul. */
export function computedAnswer(prompt) {
  const m = String(prompt).match(/^Calcule (?:[A-Z] = )?(.+?)\.?$/);
  return m ? tryEvaluate(m[1]) : null;
}
const stepValue = (label) => tryEvaluate(String(label).replace(/^[A-Z] = /, "").replace(/=\s*$/, ""));

/** Pourquoi cette question est-elle inutilisable ? (null si elle est valide) */
export function questionProblem(q) {
  if (!q || typeof q !== "object") return "question vide";
  if (!QUESTION_TYPES.includes(q.type)) return `type inconnu « ${q.type} »`;
  if (!isStr(q.prompt)) return "énoncé manquant";
  switch (q.type) {
    case "qcm":
      if (!Array.isArray(q.choices) || q.choices.length < 2) return "QCM sans choix";
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) return "QCM : index de réponse invalide";
      break;
    case "vf":
      if (typeof q.answer !== "boolean") return "vrai/faux : réponse non booléenne";
      break;
    case "nombre":
      if (![].concat(q.answer).every(isNum) || q.answer === undefined) return "réponse numérique manquante";
      break;
    case "expression":
      if (!(Array.isArray(q.accept) && q.accept.length) && !isNum(q.value)) return "expression : ni accept ni value";
      break;
    case "trous":
      if (!isStr(q.text) || !Array.isArray(q.blanks) || !q.blanks.length) return "texte à trous incomplet";
      if ((q.text.match(/\{\d+\}/g) || []).length !== q.blanks.length) return "texte à trous : nombre de cases incohérent";
      if (!q.blanks.every((b) => Array.isArray(b?.accept) && b.accept.length && b.accept.every(isStr))) return "texte à trous : réponses manquantes";
      break;
    case "associer":
      if (!Array.isArray(q.pairs) || q.pairs.length < 2 || !q.pairs.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => isStr(String(x))))) return "association incomplète";
      if (new Set(q.pairs.map((p) => String(p[1]))).size !== q.pairs.length) return "association : réponses en double";
      break;
    case "ordre":
      if (!Array.isArray(q.items) || q.items.length < 2 || !q.items.every(isStr)) return "remise en ordre incomplète";
      break;
    case "etapes":
      if (!Array.isArray(q.steps) || !q.steps.length || !q.steps.every((s) => isStr(s?.label) && isNum(s?.answer))) return "étapes incomplètes";
      break;
    case "libre":
      if (!isStr(q.model)) return "réponse modèle manquante";
      if (!Array.isArray(q.concepts) || !q.concepts.length) return "idées attendues manquantes";
      if (!q.concepts.every((c) => isStr(c?.label) && Array.isArray(c.keywords) && c.keywords.length && c.keywords.every(isStr))) return "idées attendues sans mots-clés";
      break;
  }
  return null;
}

/** Remarques non bloquantes sur une question valide. */
export function questionWarnings(q) {
  const w = [];
  if (!isStr(q.explain)) w.push("pas d'explication");
  if (q.type === "nombre") {
    const v = computedAnswer(q.prompt);
    if (v !== null && !sameNumber(v, [].concat(q.answer)[0])) w.push(`réponse ${q.answer} ≠ calcul ${v}`);
  }
  if (q.type === "etapes")
    for (const s of q.steps) {
      const v = stepValue(s.label);
      if (v !== null && !sameNumber(v, s.answer)) w.push(`étape « ${s.label} » : ${s.answer} ≠ ${v}`);
    }
  if (q.type === "ordre")
    for (const it of q.items) {
      const [l, r] = it.split("=");
      const v = r !== undefined ? tryEvaluate(l) : null;
      if (v !== null && !sameNumber(v, Number(r.trim()))) w.push(`étape « ${it} » fausse`);
    }
  if (q.type === "associer")
    for (const [l, r] of q.pairs) {
      const v = tryEvaluate(String(l));
      if (v !== null && Number.isFinite(Number(r)) && !sameNumber(v, Number(r))) w.push(`« ${l} → ${r} » faux (${v})`);
    }
  if (q.type === "expression" && q.accept && gradeQuestion(q, q.accept[0]).score !== 1) w.push("la réponse attendue n'est pas acceptée");
  if (q.type === "libre") {
    const r = gradeFree(q, q.model);
    if (r.score < 0.99) w.push(`la réponse modèle ne contient pas les mots-clés de : ${r.missing.join(", ")}`);
  }
  return w;
}

/**
 * Nettoie une leçon : corrige ce qui peut l'être sans risque (identifiants,
 * résultats de calculs recalculés), retire les questions inutilisables.
 * → { lesson, fixes: [...] }
 */
export function repairLesson(input) {
  const fixes = [];
  const l = JSON.parse(JSON.stringify(input || {}));
  l.id = slug(l.id || l.title) || "lecon";
  for (const k of ["objectives", "manuel", "course", "series"]) if (!Array.isArray(l[k])) l[k] = [];
  if (!l.beyond || !Array.isArray(l.beyond.groups)) l.beyond = { intro: l.beyond?.intro || "", groups: [] };

  l.course = l.course
    .filter((s) => s && isStr(s.title))
    .map((s, i) => ({
      ...s,
      id: slug(s.id) || `c${i + 1}`,
      blocks: (Array.isArray(s.blocks) ? s.blocks : []).filter((b) => {
        const ok = b && BLOCK_TYPES.includes(b.type);
        if (!ok) fixes.push(`bloc de fiche « ${b?.type} » ignoré`);
        return ok;
      }),
    }));

  const seenSeries = new Set();
  l.series = l.series
    .filter((s) => s && isStr(s.title))
    .map((s, i) => {
      let id = slug(s.id) || `s${i + 1}`;
      while (seenSeries.has(id)) id += "-b";
      seenSeries.add(id);
      const seenQ = new Set();
      const questions = (Array.isArray(s.questions) ? s.questions : [])
        .map((q, j) => {
          const problem = questionProblem(q);
          if (problem) {
            fixes.push(`${s.title} : question ${j + 1} retirée (${problem})`);
            return null;
          }
          let qid = slug(q.id) || `q${j + 1}`;
          while (seenQ.has(qid)) qid += "b";
          seenQ.add(qid);
          const fixed = { ...q, id: qid };
          // le moteur de calcul fait foi pour les « Calcule … »
          if (q.type === "nombre") {
            const v = computedAnswer(q.prompt);
            if (v !== null && !sameNumber(v, [].concat(q.answer)[0])) {
              fixes.push(`${s.title} : « ${q.prompt} » corrigé ${q.answer} → ${v}`);
              fixed.answer = Math.round(v * 1e9) / 1e9;
            }
          }
          if (q.type === "etapes")
            fixed.steps = q.steps.map((st) => {
              const v = stepValue(st.label);
              if (v !== null && !sameNumber(v, st.answer)) {
                fixes.push(`${s.title} : étape « ${st.label} » corrigée ${st.answer} → ${v}`);
                return { ...st, answer: Math.round(v * 1e9) / 1e9 };
              }
              return st;
            });
          return fixed;
        })
        .filter(Boolean);
      return { ...s, id, intro: s.intro || "", questions };
    })
    .filter((s) => {
      if (!s.questions.length) fixes.push(`série « ${s.title} » vide, retirée`);
      return s.questions.length > 0;
    });

  l.beyond.groups = l.beyond.groups
    .filter((g) => g && isStr(g.title) && Array.isArray(g.cards))
    .map((g, i) => ({
      ...g,
      id: slug(g.id) || `g${i + 1}`,
      icon: g.icon || "🔭",
      cards: g.cards
        .filter((c) => c && isStr(c.title) && isStr(c.text))
        .map((c) => {
          const quizOk = c.quiz && Array.isArray(c.quiz.choices) && Number.isInteger(c.quiz.answer) && c.quiz.answer >= 0 && c.quiz.answer < c.quiz.choices.length;
          if (c.quiz && !quizOk) fixes.push(`mini-quiz « ${c.title} » retiré`);
          return quizOk ? c : { ...c, quiz: undefined };
        }),
    }));
  return { lesson: l, fixes };
}

export function checkLesson(l) {
  const errors = [];
  const warnings = [];
  if (!l || typeof l !== "object") return { errors: ["leçon vide"], warnings };
  for (const k of ["id", "title", "subject"]) if (!isStr(l[k])) errors.push(`champ « ${k} » manquant`);
  if (!Array.isArray(l.series) || !l.series.length) errors.push("aucune série d'exercices");
  if (!Array.isArray(l.course) || !l.course.length) errors.push("pas de fiche de révision");
  for (const s of l.series || []) {
    for (const q of s.questions || []) {
      const p = questionProblem(q);
      if (p) errors.push(`${s.id}/${q.id} : ${p}`);
      else for (const w of questionWarnings(q)) warnings.push(`${s.title} — ${String(q.prompt).slice(0, 60)} : ${w}`);
    }
  }
  return { errors, warnings };
}

/** Texte final d'une réponse Claude : ce qui suit la dernière recherche web éventuelle. */
export function finalText(content = []) {
  let start = 0;
  content.forEach((b, i) => {
    if (/_tool_result$/.test(b?.type || "")) start = i + 1;
  });
  const after = content.slice(start).filter((b) => b?.type === "text");
  const blocks = after.length ? after : content.filter((b) => b?.type === "text");
  return blocks.map((b) => b.text).join("");
}

/** Extrait l'objet JSON d'un texte (tolère des ``` ou du texte autour). */
export function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("La réponse de Claude ne contient pas de leçon lisible.");
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    throw new Error("La leçon générée est mal formée.");
  }
}
