// Les enfants suivis par Précepteur. Ajouter un enfant : une ligne ici +
// son identifiant dans netlify/shared/children.js (liste blanche serveur).
export const CHILDREN = [
  { id: "aurelius", name: "Aurelius", color: "#1d4ed8", soft: "#dbeafe", emblem: "🦅", motto: "Per aspera ad astra" },
  { id: "livia", name: "Livia", color: "#db2777", soft: "#fce7f3", emblem: "🦉", motto: "Sapere aude" },
];

export const childById = (id) => CHILDREN.find((c) => c.id === id);
