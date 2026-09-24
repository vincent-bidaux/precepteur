// Taille d'une leçon à créer : longueur de la fiche de révision et nombre de
// questions. Partagé entre l'espace parents (curseurs) et les consignes à Claude.

export const LENGTHS = [
  { level: 1, label: "Très courte", sections: "2", minutes: 3 },
  { level: 2, label: "Courte", sections: "2 à 3", minutes: 5 },
  { level: 3, label: "Moyenne", sections: "3 à 4", minutes: 8 },
  { level: 4, label: "Longue", sections: "4 à 5", minutes: 12 },
  { level: 5, label: "Très longue", sections: "5 à 6", minutes: 16 },
];
export const DEFAULT_LENGTH = 3;

export const QUESTIONS = { min: 10, max: 80, step: 5, default: 40 };
const SECONDS_PER_QUESTION = 45; // lecture, réponse et lecture de l'explication

export const lengthInfo = (level) => LENGTHS.find((l) => l.level === Number(level)) || LENGTHS[DEFAULT_LENGTH - 1];

/** Nombre de séries (thèmes) adapté : environ 8 questions par série. */
export const seriesFor = (n) => Math.min(10, Math.max(2, Math.round(n / 8)));

export const minutesForQuestions = (n) => Math.round((n * SECONDS_PER_QUESTION) / 60);

/** Valeurs sûres à partir d'une saisie quelconque. */
export function cleanSize(input = {}) {
  const length = lengthInfo(input.length).level;
  const q = Number(input.questions);
  const questions = Number.isFinite(q) ? Math.min(QUESTIONS.max, Math.max(QUESTIONS.min, Math.round(q / QUESTIONS.step) * QUESTIONS.step)) : QUESTIONS.default;
  return { length, questions, series: seriesFor(questions) };
}

/** Consigne de volume donnée à Claude. */
export function sizeInstruction(size) {
  const { length, questions, series } = cleanSize(size);
  const l = lengthInfo(length);
  return `Volume demandé par le parent :
- Fiche de révision « ${l.label} » : ${l.sections} sections, environ ${l.minutes} minutes de lecture.
- Exercices : exactement ${questions} questions au total, réparties en ${series} séries thématiques de taille voisine (la dernière série, « Explique comme un prof », de réponses libres, compte dans le total).`;
}
