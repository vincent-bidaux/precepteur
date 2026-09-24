// Fonction planifiée : chaque minute, fait avancer les leçons en cours de
// création, même si personne n'a l'espace parents ouvert.
import { openStore } from "../shared/db.js";
import { advanceAll } from "../shared/jobs.js";
import { anthropicClient } from "../shared/ai.js";

export const config = { schedule: "* * * * *" };

export default async () => {
  const client = anthropicClient();
  if (client) await advanceAll(openStore(), client);
};
