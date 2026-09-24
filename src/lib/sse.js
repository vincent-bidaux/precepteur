// Lecture du flux SSE de l'API Claude (relayé par /api/generate) :
// reconstitue le texte généré et détecte les fins anormales.

/** Découpe un flux SSE en évènements { event, data } (data déjà décodé en JSON). */
export async function* readSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, "");
      const ev = parseEvent(raw);
      if (ev) yield ev;
    }
    if (done) {
      const ev = parseEvent(buf);
      if (ev) yield ev;
      return;
    }
  }
}

function parseEvent(raw) {
  let event = "message";
  const data = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

export class GenerationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Accumule le texte d'une réponse Claude en streaming.
 * onProgress(nbCaractères, phase) est appelé au fil de l'eau ("reflexion" puis "ecriture").
 */
export async function collectText(stream, onProgress = () => {}) {
  let text = "";
  let stop = null;
  for await (const { event, data } of readSSE(stream)) {
    if (event === "error" || data?.type === "error") throw new GenerationError("ai_error", data?.error?.message || "Erreur de l'IA");
    if (data?.type === "content_block_start" && data.content_block?.type === "thinking") onProgress(text.length, "reflexion");
    if (data?.type === "content_block_delta" && data.delta?.type === "text_delta") {
      text += data.delta.text;
      onProgress(text.length, "ecriture");
    }
    if (data?.type === "message_delta" && data.delta?.stop_reason) stop = data.delta.stop_reason;
  }
  if (stop === "refusal") throw new GenerationError("refusal", "Claude a refusé de traiter ces photos.");
  if (stop === "max_tokens") throw new GenerationError("max_tokens", "La leçon générée est trop longue et a été coupée.");
  if (!text.trim()) throw new GenerationError("empty", "Réponse vide.");
  return text;
}

/** Extrait l'objet JSON d'un texte (tolère des ``` ou du texte autour). */
export function extractJson(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new GenerationError("json", "La réponse ne contient pas de leçon lisible.");
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch {
    throw new GenerationError("json", "La leçon générée est mal formée.");
  }
}
