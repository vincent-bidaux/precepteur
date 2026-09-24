// Modèles Claude utilisés et leur prix (en dollars US par million de jetons,
// tarifs publics Anthropic). Sert à estimer et à comptabiliser les coûts.
// Si Anthropic change ses tarifs, c'est le seul endroit à mettre à jour.

export const MODELS = {
  "claude-haiku-4-5": { label: "Haiku 4.5", desc: "économique", in: 1, out: 5 },
  "claude-sonnet-5": { label: "Sonnet 5", desc: "bon équilibre qualité / prix", in: 2, out: 10 },
  "claude-opus-5": { label: "Opus 5", desc: "qualité maximale", in: 5, out: 25 },
};

/** Modèles proposés pour créer une leçon, du moins cher au plus cher. */
export const CREATION_MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];
export const DEFAULT_CREATION_MODEL = "claude-sonnet-5";
/** Correction des réponses libres : une réponse courte à juger, le plus économique suffit. */
export const GRADING_MODEL = "claude-haiku-4-5";

export const WEB_SEARCH_USD = 0.01; // 10 $ les 1 000 recherches
export const BATCH_DISCOUNT = 0.5; // l'API Batches coûte moitié prix

/** Coût d'un appel, d'après le champ usage renvoyé par l'API. */
export function costOf(usage, model, { batch = false } = {}) {
  const p = MODELS[model];
  if (!usage || !p) return 0;
  const input =
    (usage.input_tokens || 0) * p.in + (usage.cache_creation_input_tokens || 0) * p.in * 1.25 + (usage.cache_read_input_tokens || 0) * p.in * 0.1;
  const tokens = (input + (usage.output_tokens || 0) * p.out) / 1e6;
  const searches = (usage.server_tool_use?.web_search_requests || 0) * WEB_SEARCH_USD;
  return tokens * (batch ? BATCH_DISCOUNT : 1) + searches;
}

// Ordres de grandeur pour l'estimation affichée avant création : consignes +
// exemple ≈ 20 000 jetons, une photo ≈ 1 600 ; la leçon produite grossit avec
// la longueur de fiche et le nombre de questions (réflexion comprise).
export function estimateCreation(model, { photos = 0, length = 3, questions = 40 } = {}) {
  const usage = { input_tokens: 20000 + photos * 1600, output_tokens: 6000 + length * 2500 + questions * 550 };
  return costOf(usage, model, { batch: true });
}
export const estimateGrading = () => costOf({ input_tokens: 700, output_tokens: 250 }, GRADING_MODEL);

/** 0.4213 → « 0,42 $ » ; très petits montants : « < 0,01 $ ». */
export function formatUsd(x) {
  if (!x) return "0 $";
  if (x < 0.01) return "< 0,01 $";
  return `${x.toFixed(2).replace(".", ",")} $`;
}
