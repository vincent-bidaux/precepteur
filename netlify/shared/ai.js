// Client Claude pour les fonctions serveur (null si aucune clé n'est configurée).
import Anthropic from "@anthropic-ai/sdk";

export function anthropicClient(env = process.env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  // PRECEPTEUR_ANTHROPIC_URL : uniquement pour les tests (faux serveur Claude)
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.PRECEPTEUR_ANTHROPIC_URL || "https://api.anthropic.com" });
}
