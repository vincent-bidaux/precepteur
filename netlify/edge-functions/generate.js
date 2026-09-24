// Edge Function (Deno) : voir netlify/shared/generate.js
import { handleGenerate } from "../shared/generate.js";

export const config = { path: "/api/generate" };

export default (req) =>
  handleGenerate(req, {
    apiKey: Netlify.env.get("ANTHROPIC_API_KEY"),
    parentCode: Netlify.env.get("PRECEPTEUR_CODE_PARENT"),
  });
