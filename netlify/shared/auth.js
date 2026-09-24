// Code parent optionnel. Si la variable d'environnement PRECEPTEUR_CODE_PARENT
// est définie, les actions parent qui modifient des données ou coûtent de
// l'argent (créer / modifier / supprimer une leçon, générer avec Claude)
// exigent l'en-tête x-parent-code. Sans variable : ouvert, comme le reste.
export function parentCodeOk(req, expected) {
  if (!expected) return true;
  const given = req.headers.get("x-parent-code") || "";
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
