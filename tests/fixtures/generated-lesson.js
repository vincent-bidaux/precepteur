// Leçon telle que Claude pourrait la renvoyer, avec deux défauts volontaires :
// un résultat de calcul faux (corrigé automatiquement) et un QCM invalide
// (retiré automatiquement).
export default {
  id: "Français — Le participe passé",
  subject: "Français",
  title: "L'accord du participe passé",
  subtitle: "Avec être, avec avoir, et les pièges",
  icon: "✍️",
  source: "Photos : 2 pages du cahier de français",
  objectives: ["Accorder le participe passé avec être", "Accorder le participe passé avec avoir"],
  manuel: [],
  course: [
    {
      id: "etre",
      title: "1. Avec l'auxiliaire être",
      blocks: [
        { type: "definition", term: "Participe passé", text: "Forme du verbe utilisée dans les temps composés : *chanté*, *fini*, *pris*." },
        { type: "retenir", text: "Avec **être**, le participe passé s'accorde avec le **sujet** : *Elles sont parties.*" },
        { type: "liste", items: ["Il est parti.", "Elle est partie.", "Ils sont partis."] },
        { type: "video", url: "https://example.com" },
      ],
    },
    {
      id: "avoir",
      title: "2. Avec l'auxiliaire avoir",
      blocks: [{ type: "piege", text: "Avec **avoir**, on n'accorde **pas** avec le sujet : *Elles ont mangé.*" }],
    },
  ],
  series: [
    {
      id: "s1",
      title: "Échauffement",
      intro: "On commence doucement.",
      questions: [
        { id: "q1", type: "qcm", prompt: "*Elles sont ___* (partir)", choices: ["parti", "partie", "parties"], answer: 2, explain: "Avec être, accord avec le sujet *elles* : féminin pluriel." },
        { id: "q2", type: "vf", prompt: "Avec avoir, on accorde toujours avec le sujet.", answer: false, explain: "Non : avec avoir, jamais avec le sujet." },
        { id: "q3", type: "qcm", prompt: "Question cassée", choices: ["a", "b"], answer: 5, explain: "…" },
        { id: "q4", type: "trous", prompt: "Complète.", text: "Avec l'auxiliaire {0}, le participe passé s'accorde avec le sujet.", blanks: [{ accept: ["être", "etre"] }], explain: "C'est la règle de base." },
        { id: "q5", type: "nombre", prompt: "Calcule 2 + 3 × 4.", answer: 20, explain: "Petit détour par les maths : 2 + 12 = 14." },
      ],
    },
    {
      id: "s2",
      title: "Explique comme un prof",
      intro: "À toi d'expliquer.",
      questions: [
        {
          id: "q1",
          type: "libre",
          prompt: "Explique quand on accorde le participe passé avec le sujet.",
          model: "On accorde le participe passé avec le sujet quand l'auxiliaire est être, par exemple : elles sont parties.",
          concepts: [
            { label: "Avec l'auxiliaire être", keywords: ["etre", "être"] },
            { label: "Accord avec le sujet", keywords: ["sujet"] },
          ],
          explain: "Avec être, accord avec le sujet.",
        },
      ],
    },
  ],
  beyond: {
    intro: "Et ensuite ?",
    groups: [
      { id: "apres", title: "Et après ?", icon: "🚀", cards: [{ title: "Le COD placé avant", text: "En 4e : *les pommes que j'ai mangées*.", quiz: { prompt: "Accord ?", choices: ["mangé", "mangées"], answer: 1, explain: "COD *que* = les pommes, placé avant." } }] },
      { id: "ailleurs", title: "Ailleurs", icon: "🌍", cards: [{ title: "En anglais", text: "Pas d'accord : *they have eaten*.", quiz: { prompt: "?", choices: ["a"], answer: 3 } }] },
    ],
  },
};
