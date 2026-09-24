/**
 * Préparation d'une demande de leçon à Claude, à partir de photos et/ou
 * d'un texte (plan, partie du programme, notes). La demande elle-même est
 * envoyée en tâche de fond par netlify/shared/jobs.js (API Batches).
 */
import { SYSTEM_PROMPT, TOOLS, userPrompt } from "./prompt.js";

export const MODEL = "claude-opus-5";
export const MAX_IMAGES = 10;
export const MIN_TEXT = 20;
export const MAX_TEXT = 12000;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_TOTAL_B64 = 5_500_000; // limite de taille d'une requête de fonction Netlify (6 Mo)

/** Vérifie la demande du parent. → { images, notes } ou { error, status } */
export function validateInput(body) {
  const images = Array.isArray(body?.images) ? body.images : [];
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, MAX_TEXT) : "";
  if (!images.length && notes.length < MIN_TEXT) return { error: "no_content", status: 400 };
  if (images.length > MAX_IMAGES) return { error: "too_many_images", status: 400 };
  let total = 0;
  for (const img of images) {
    if (!TYPES.includes(img?.media_type) || typeof img.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200))) return { error: "bad_image", status: 400 };
    total += img.data.length;
  }
  if (total > MAX_TOTAL_B64) return { error: "too_big", status: 413 };
  return { images: images.map(({ media_type, data }) => ({ media_type, data })), notes };
}

/** Paramètres de la requête Messages (sans streaming : elle part dans un batch). */
export function buildParams(images, notes) {
  return {
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort: "high" },
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
          { type: "text", text: userPrompt(notes, images.length) },
        ],
      },
    ],
  };
}
