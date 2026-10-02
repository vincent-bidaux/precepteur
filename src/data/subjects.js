// Matières et niveaux scolaires (France). Une icône par matière, utilisée
// partout ; le lien « programme » pointe vers la page officielle éduscol du
// cycle correspondant au niveau (programmes, attendus et repères annuels).

export const SUBJECTS = [
  { id: "mathematiques", label: "Mathématiques", short: "Maths", icon: "📐", aliases: ["maths", "math", "mathematique", "calcul", "geometrie", "numeration"], cycles: [2, 3, 4] },
  { id: "francais", label: "Français", icon: "📖", aliases: ["grammaire", "orthographe", "conjugaison", "lecture", "litterature", "vocabulaire", "expression ecrite"], cycles: [2, 3, 4] },
  { id: "histoire-geographie", label: "Histoire-Géographie", short: "Histoire-Géo", icon: "🏛️", aliases: ["histoire", "geographie", "histoire geo", "histoire-geo"], cycles: [3, 4] },
  { id: "emc", label: "Enseignement moral et civique", short: "EMC", icon: "⚖️", aliases: ["education civique", "enseignement moral", "morale"], cycles: [2, 3, 4] },
  { id: "anglais", label: "Anglais", icon: "🇬🇧", aliases: ["english"], cycles: [2, 3, 4] },
  { id: "espagnol", label: "Espagnol", icon: "🇪🇸", aliases: ["espanol"], cycles: [4], option: true },
  { id: "allemand", label: "Allemand", icon: "🇩🇪", aliases: ["deutsch"], cycles: [4], option: true },
  { id: "italien", label: "Italien", icon: "🇮🇹", aliases: [], cycles: [4], option: true },
  { id: "svt", label: "Sciences de la vie et de la Terre", short: "SVT", icon: "🌱", aliases: ["sciences de la vie", "biologie", "geologie"], cycles: [4] },
  { id: "physique-chimie", label: "Physique-Chimie", icon: "⚗️", aliases: ["physique", "chimie"], cycles: [4] },
  { id: "questionner-le-monde", label: "Questionner le monde", icon: "🌍", aliases: ["decouverte du monde", "qlm"], cycles: [2] },
  { id: "sciences", label: "Sciences et technologie", short: "Sciences", icon: "🔬", aliases: ["sciences et technologie", "science"], cycles: [3] },
  { id: "technologie", label: "Technologie", short: "Techno", icon: "⚙️", aliases: ["techno"], cycles: [4] },
  { id: "arts-plastiques", label: "Arts plastiques", icon: "🎨", aliases: ["arts", "dessin"], cycles: [2, 3, 4] },
  { id: "musique", label: "Éducation musicale", short: "Musique", icon: "🎵", aliases: ["education musicale"], cycles: [2, 3, 4] },
  { id: "eps", label: "Éducation physique et sportive", short: "EPS", icon: "⚽", aliases: ["sport", "education physique"], cycles: [2, 3, 4] },
  { id: "latin", label: "Latin", icon: "🏺", aliases: ["langues et cultures de l'antiquite", "grec"], cycles: [4], option: true },
  { id: "autre", label: "Autre", icon: "📘", aliases: [], cycles: [] },
];

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const subjectById = (id) => SUBJECTS.find((s) => s.id === id) || SUBJECTS.at(-1);

/** « Maths », « mathématiques », « Géométrie »… → la matière du catalogue. */
export function subjectOf(input) {
  const n = norm(input);
  if (!n) return subjectById("autre");
  const exact = SUBJECTS.find((s) => s.id === n.replace(/ /g, "-") || norm(s.label) === n || norm(s.short) === n || s.aliases.includes(n));
  if (exact) return exact;
  return SUBJECTS.find((s) => s.id !== "autre" && [s.label, s.short, ...s.aliases].some((a) => a && (n.startsWith(norm(a)) || norm(a).startsWith(n)))) || subjectById("autre");
}

export const LEVELS = ["CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e"];

/** « 5ème », « cinquième », « 5e » → « 5e » ; « cm2 » → « CM2 » ; inconnu → null. */
export function levelOf(input) {
  const n = norm(input).replace(/ /g, "");
  if (!n) return null;
  const words = { sixieme: "6e", cinquieme: "5e", quatrieme: "4e", troisieme: "3e" };
  if (words[n]) return words[n];
  const college = n.match(/^([3-6])(e|eme|ieme)?$/);
  if (college) return `${college[1]}e`;
  const primaire = LEVELS.find((l) => norm(l) === n);
  return primaire || null;
}

export function cycleOf(level) {
  return { CP: 2, CE1: 2, CE2: 2, CM1: 3, CM2: 3, "6e": 3, "5e": 4, "4e": 4, "3e": 4 }[level] || null;
}

const CYCLE_PAGES = {
  2: "https://eduscol.education.gouv.fr/4347/enseigner-au-cycle-2",
  3: "https://eduscol.education.gouv.fr/4356/enseigner-au-cycle-3",
  4: "https://eduscol.education.gouv.fr/4362/enseigner-au-cycle-4",
};

/** Page officielle des programmes pour ce niveau (null si niveau inconnu). */
export const programUrl = (level) => CYCLE_PAGES[cycleOf(level)] || null;

/**
 * Matières enseignées pour ces classes (programmes officiels : cycle 2 CP-CE2,
 * cycle 3 CM1-6e, cycle 4 5e-3e), dans l'ordre du catalogue. Sans classe
 * connue : toutes les matières. Les options (LV2, latin) sont marquées.
 */
export function taughtSubjects(levels = []) {
  const cycles = new Set(levels.map(cycleOf).filter(Boolean));
  return SUBJECTS.filter((s) => s.id !== "autre" && (!cycles.size || s.cycles.some((c) => cycles.has(c))));
}

/** « 📐 Mathématiques · 5e » */
export const subjectLine = (subject, level, { short = false } = {}) =>
  `${subject.icon} ${short && subject.short ? subject.short : subject.label}${level ? ` · ${level}` : ""}`;
