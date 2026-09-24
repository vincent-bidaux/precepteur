import { describe, it, expect } from "vitest";
import { readSSE, collectText, extractJson } from "../../src/lib/sse.js";

/** Flux découpé en morceaux arbitraires (y compris au milieu d'un caractère UTF-8). */
function streamOf(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i >= bytes.length) return ctrl.close();
      ctrl.enqueue(bytes.slice(i, i + size));
      i += size;
    },
  });
}
const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const delta = (text) => ev("content_block_delta", { index: 1, delta: { type: "text_delta", text } });

describe("flux SSE de Claude", () => {
  it("reconstitue le texte, accents et découpage compris", async () => {
    const sse =
      ev("message_start", { message: {} }) +
      ev("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }) +
      ev("ping", {}) +
      delta('{"title":"Leçon ') +
      delta('été"}') +
      ev("message_delta", { delta: { stop_reason: "end_turn" } }) +
      ev("message_stop", {});
    const phases = [];
    const text = await collectText(streamOf(sse, 5), (n, p) => phases.push(p));
    expect(text).toBe('{"title":"Leçon été"}');
    expect(phases[0]).toBe("reflexion");
    expect(phases.at(-1)).toBe("ecriture");
  });

  it("signale refus, coupure et erreur", async () => {
    await expect(collectText(streamOf(delta("{") + ev("message_delta", { delta: { stop_reason: "refusal" } })))).rejects.toMatchObject({ code: "refusal" });
    await expect(collectText(streamOf(delta("{") + ev("message_delta", { delta: { stop_reason: "max_tokens" } })))).rejects.toMatchObject({ code: "max_tokens" });
    await expect(collectText(streamOf(ev("error", { error: { type: "overloaded_error", message: "Overloaded" } })))).rejects.toMatchObject({ code: "ai_error" });
    await expect(collectText(streamOf(ev("message_stop", {})))).rejects.toMatchObject({ code: "empty" });
  });

  it("lit des évènements CRLF et ignore les lignes illisibles", async () => {
    const events = [];
    for await (const e of readSSE(streamOf('event: a\r\ndata: {"x":1}\r\n\r\ndata: pas du json\n\ndata: {"y":2}'))) events.push(e);
    expect(events).toEqual([{ event: "a", data: { x: 1 } }, { event: "message", data: { y: 2 } }]);
  });

  it("extrait le JSON même entouré de texte ou de ```", () => {
    expect(extractJson('```json\n{"a":{"b":1}}\n```')).toEqual({ a: { b: 1 } });
    expect(() => extractJson("désolé")).toThrow(/lisible/);
    expect(() => extractJson("{ pas: json }")).toThrow(/mal formée/);
  });
});
