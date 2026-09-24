// Leçons intégrées au code. Ajouter une leçon à la main = créer un fichier
// dans ce dossier (voir README) puis l'importer ici. Les leçons créées avec
// Claude depuis l'espace parents sont stockées sur le serveur, pas ici ; le
// catalogue complet côté client est dans src/catalog.js.
import reglesDeCalcul1 from "./maths-regles-de-calcul-1.js";

export const LESSONS = [reglesDeCalcul1];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

export function findQuestion(lessonId, qid) {
  // qid = "<serie>/<question>"
  const lesson = lessonById(lessonId);
  const [sid, id] = String(qid || "").split("/");
  return lesson?.series.find((s) => s.id === sid)?.questions.find((q) => q.id === id) ?? null;
}
