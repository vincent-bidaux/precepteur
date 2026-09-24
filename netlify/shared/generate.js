/**
 * Génération d'une leçon par Claude à partir de photos et/ou d'un texte
 * (plan, partie du programme, notes).
 *
 *   POST /api/generate { images?: [{ media_type, data(base64) }], notes }
 *     (au moins une photo, ou un texte d'au moins MIN_TEXT caractères)
 *     → flux SSE de l'API Claude, relayé tel quel au navigateur, qui
 *       reconstitue le texte (JSON de la leçon), le vérifie puis l'enregistre
 *       via POST /api/lessons.
 *
 * Tourne dans une Edge Function Netlify (Deno) : une génération complète
 * prend 1 à 4 minutes, bien plus que la limite d'une fonction classique, et
 * une Edge Function peut streamer aussi longtemps que des octets circulent.
 * On relaie le flux brut (appel HTTP direct plutôt que le SDK) car l'Edge
 * Function a un budget CPU de 50 ms : décoder chaque évènement le dépasserait,
 * alors que recopier des octets ne coûte presque rien.
 *
 * Ce fichier n'utilise que des API web standard (pas de module Node).
 */
import { SYSTEM_PROMPT, userPrompt } from "./prompt.js";
import { parentCodeOk } from "./auth.js";
import { json } from "./log.js";

export const MODEL = "claude-opus-5";
export const MAX_IMAGES = 10;
export const MIN_TEXT = 20;
export const MAX_TEXT = 12000;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_TOTAL_B64 = 24_000_000;

export function buildRequest(images, notes) {
  return {
    model: MODEL,
    max_tokens: 64000,
    stream: true,
    // si un filtre de sécurité refuse, l'API relance la demande sur le modèle de repli recommandé
    fallbacks: "default",
    output_config: { effort: "high" },
    system: SYSTEM_PROMPT,
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

export async function handleGenerate(req, { apiKey, parentCode, baseUrl = "https://api.anthropic.com", fetchImpl = fetch } = {}) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!parentCodeOk(req, parentCode)) return json({ error: "code_parent" }, 401);
  if (!apiKey) return json({ error: "ai_disabled" }, 501);

  const body = await req.json().catch(() => null);
  const images = Array.isArray(body?.images) ? body.images : [];
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, MAX_TEXT) : "";
  if (!images.length && notes.length < MIN_TEXT) return json({ error: "no_content" }, 400);
  if (images.length > MAX_IMAGES) return json({ error: "too_many_images" }, 400);
  let total = 0;
  for (const img of images) {
    if (!TYPES.includes(img?.media_type) || typeof img.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200))) return json({ error: "bad_image" }, 400);
    total += img.data.length;
  }
  if (total > MAX_TOTAL_B64) return json({ error: "too_big" }, 413);

  let upstream;
  try {
    upstream = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify(buildRequest(images, notes)),
    });
  } catch {
    return json({ error: "ai_unreachable" }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: "ai_error", status: upstream.status, detail: detail.slice(0, 500) }, upstream.status === 429 ? 429 : 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
  });
}
