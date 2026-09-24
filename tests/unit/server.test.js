import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleLog, cleanRecord } from "../../netlify/shared/log.js";
import { handleGrade, buildPrompt } from "../../netlify/shared/grade.js";
import { openStore } from "../../netlify/shared/db.js";
import { findQuestion } from "../../src/lessons/index.js";

const dirs = [];
function freshStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "precepteur-"));
  dirs.push(dir);
  process.env.PRECEPTEUR_FS_STORE = dir;
  return openStore();
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const post = (records) => new Request("http://x/api/log", { method: "POST", body: JSON.stringify({ records }) });
const get = (q = "") => new Request(`http://x/api/log${q}`);
const rec = (i, extra = {}) => ({ id: `rec-${String(i).padStart(4, "0")}`, type: "attempt", child: "aurelius", lessonId: "l", seriesId: "s", ts: Date.UTC(2026, 8, 24, 10, i % 60), note20: 15, score: 3, max: 4, answers: [{ qid: "s/q1", score: 1, max: 1, given: "42" }], ...extra });

describe("/api/log", () => {
  let store;
  beforeEach(() => (store = freshStore()));

  it("enregistre puis relit, par enfant ou tous", async () => {
    const r = await handleLog(post([rec(1), rec(2, { child: "livia" })]), store);
    expect(r.status).toBe(200);
    expect((await r.json()).saved).toBe(2);
    expect((await (await handleLog(get(), store)).json()).records).toHaveLength(2);
    const livia = (await (await handleLog(get("?child=livia"), store)).json()).records;
    expect(livia.map((x) => x.id)).toEqual(["rec-0002"]);
  });

  it("ignore les doublons (renvoi d'une file hors ligne)", async () => {
    await handleLog(post([rec(1), rec(2)]), store);
    const again = await (await handleLog(post([rec(2), rec(3)]), store)).json();
    expect(again.saved).toBe(1);
    expect((await (await handleLog(get(), store)).json()).records).toHaveLength(3);
  });

  it("range par mois", async () => {
    await handleLog(post([rec(1), rec(2, { ts: Date.UTC(2026, 9, 2) })]), store);
    const { blobs } = await store.list({ prefix: "log/aurelius/" });
    expect(blobs.map((b) => b.key).sort()).toEqual(["log/aurelius/2026-09", "log/aurelius/2026-10"]);
  });

  it("ne perd rien avec des écritures simultanées (etag + nouvelle tentative)", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => handleLog(post([rec(100 + i)]), store)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await (await handleLog(get(), store)).json()).records).toHaveLength(8);
  });

  it("rejette les données invalides", async () => {
    expect(cleanRecord(rec(1, { child: "inconnu" }))).toBeNull();
    expect(cleanRecord(rec(1, { id: "x" }))).toBeNull();
    expect(cleanRecord(rec(1, { type: "hack" }))).toBeNull();
    expect(cleanRecord({ ...rec(1), extra: "<script>" }).extra).toBeUndefined();
    expect(cleanRecord(rec(1, { answers: [{ qid: "a", given: "x".repeat(5000) }] })).answers[0].given).toHaveLength(2000);
    expect((await handleLog(new Request("http://x/api/log", { method: "POST", body: "pas du json" }), store)).status).toBe(400);
    expect((await handleLog(get("?child=zorro"), store)).status).toBe(400);
    expect((await handleLog(new Request("http://x/api/log", { method: "DELETE" }), store)).status).toBe(405);
  });
});

describe("/api/grade", () => {
  const body = (b) => new Request("http://x/api/grade", { method: "POST", body: JSON.stringify(b) });
  const valid = { lessonId: "maths-regles-de-calcul-1", qid: "s7-explique/q1", answer: "car 4^2=16 donc 19", child: "livia" };

  it("501 sans clé API : le client garde la correction par mots-clés", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await handleGrade(body(valid))).status).toBe(501);
  });

  it("utilise Claude quand il est configuré et borne le score", async () => {
    let seen;
    const client = {
      messages: {
        create: async (params) => {
          seen = params;
          return {
            stop_reason: "end_turn",
            usage: { input_tokens: 700, output_tokens: 200 },
            content: [{ type: "text", text: JSON.stringify({ score: 1.4, feedback: "Très bien !", found: ["4^2 = 16"], missing: [] }) }],
          };
        },
      },
    };
    const res = await handleGrade(body(valid), { client });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.score).toBe(1);
    expect(out.feedback).toBe("Très bien !");
    expect(seen.model).toBe("claude-haiku-4-5"); // le moins cher suffit pour corriger une réponse courte
    expect(seen.output_config).toEqual({ format: expect.objectContaining({ type: "json_schema" }) }); // pas d'effort sur Haiku
    expect(seen.fallbacks).toBeUndefined();
    expect(out.cost).toBeCloseTo((700 * 1 + 200 * 5) / 1e6, 9);
    expect(seen.messages[0].content).toContain("car 4^2=16 donc 19");
  });

  it("refuse une question inconnue ou non libre", async () => {
    const client = { messages: { create: async () => ({}) } };
    expect((await handleGrade(body({ ...valid, qid: "s1-operations/q3" }), { client })).status).toBe(404);
    expect((await handleGrade(body({ ...valid, qid: "nope/q1" }), { client })).status).toBe(404);
    expect((await handleGrade(body({ ...valid, answer: "  " }), { client })).status).toBe(400);
  });

  it("le prompt reprend la question et les idées attendues", () => {
    const q = findQuestion("maths-regles-de-calcul-1", "s7-explique/q1");
    const p = buildPrompt(q, "ma réponse", "Livia");
    expect(p).toContain("Livia");
    expect(p).toContain("4^2 = 16");
    expect(p).toContain("<reponse>\nma réponse\n</reponse>");
  });
});
