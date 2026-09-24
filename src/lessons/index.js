// Registre des leçons. Ajouter une leçon = créer un fichier dans ce dossier
// (voir README) puis l'importer ici. L'ordre du tableau n'a pas d'importance :
// l'accueil trie par date d'ajout.
import reglesDeCalcul1 from "./maths-regles-de-calcul-1.js";

export const LESSONS = [reglesDeCalcul1];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

export const lessonsFor = (childId) =>
  LESSONS.filter((l) => !l.children || l.children.includes(childId)).sort((a, b) => b.addedAt.localeCompare(a.addedAt));

export function findQuestion(lessonId, qid) {
  // qid = "<serie>/<question>"
  const lesson = lessonById(lessonId);
  const [sid, id] = String(qid || "").split("/");
  return lesson?.series.find((s) => s.id === sid)?.questions.find((q) => q.id === id) ?? null;
}
