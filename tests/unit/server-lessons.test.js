import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleLessons } from "../../netlify/shared/lessons.js";
import { handleGenerate, buildRequest, MODEL } from "../../netlify/shared/generate.js";
import { handleGrade } from "../../netlify/shared/grade.js";
import { SYSTEM_PROMPT } from "../../netlify/shared/prompt.js";
import { openStore } from "../../netlify/shared/db.js";
import generated from "../fixtures/generated-lesson.js";

const dirs = [];
function freshStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "precepteur-l-"));
  dirs.push(dir);
  process.env.PRECEPTEUR_FS_STORE = dir;
  return openStore();
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const req = (method, body, { id, code } = {}) =>
  new Request(`http://x/api/lessons${id ? `?id=${id}` : ""}`, {
    method,
    headers: code ? { "x-parent-code": code } : {},
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

describe("/api/lessons", () => {
  let store;
  beforeEach(() => (store = freshStore()));

  it("enregistre une leçon générée (réparée, en brouillon, pour les enfants choisis)", async () => {
    const res = await handleLessons(req("POST", { lesson: generated, children: ["livia", "zorro"] }), store);
    expect(res.status).toBe(201);
    const out = await res.json();
    expect(out.lesson.id).toBe("francais-le-participe-passe");
    expect(out.lesson.origin).toBe("claude");
    expect(out.meta[out.lesson.id]).toEqual({ children: ["livia"], status: "brouillon" });
    expect(out.fixes.length).toBeGreaterThan(0);
    const list = await (await handleLessons(req("GET"), store)).json();
    expect(list.lessons.map((l) => l.id)).toEqual(["francais-le-participe-passe"]);
    // même titre une deuxième fois → nouvel identifiant, rien n'est écrasé
    const again = await (await handleLessons(req("POST", { lesson: generated, children: ["livia"] }), store)).json();
    expect(again.lesson.id).toBe("francais-le-participe-passe-2");
  });

  it("ne réutilise jamais l'identifiant d'une leçon intégrée", async () => {
    const out = await (await handleLessons(req("POST", { lesson: { ...generated, id: "maths-regles-de-calcul-1" } }), store)).json();
    expect(out.lesson.id).toBe("maths-regles-de-calcul-1-2");
  });

  it("refuse une leçon inutilisable", async () => {
    const res = await handleLessons(req("POST", { lesson: { title: "x" } }), store);
    expect(res.status).toBe(422);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
    expect((await handleLessons(req("POST", "pas du json"), store)).status).toBe(400);
  });

  it("affecte et publie (y compris une leçon intégrée)", async () => {
    let r = await handleLessons(req("PUT", { children: ["aurelius"] }, { id: "maths-regles-de-calcul-1" }), store);
    expect((await r.json()).meta["maths-regles-de-calcul-1"]).toEqual({ children: ["aurelius"] });
    const { lesson } = await (await handleLessons(req("POST", { lesson: generated }), store)).json();
    r = await handleLessons(req("PUT", { status: "publiee" }, { id: lesson.id }), store);
    expect((await r.json()).meta[lesson.id].status).toBe("publiee");
    expect((await handleLessons(req("PUT", { status: "zzz" }, { id: lesson.id }), store)).status).toBe(400);
    expect((await handleLessons(req("PUT", { children: "livia" }, { id: lesson.id }), store)).status).toBe(400);
    expect((await handleLessons(req("PUT", { status: "publiee" }, { id: "inconnue" }), store)).status).toBe(404);
  });

  it("supprime une leçon créée, jamais une leçon intégrée", async () => {
    const { lesson } = await (await handleLessons(req("POST", { lesson: generated }), store)).json();
    expect((await handleLessons(req("DELETE", undefined, { id: "maths-regles-de-calcul-1" }), store)).status).toBe(400);
    const r = await handleLessons(req("DELETE", undefined, { id: lesson.id }), store);
    expect((await r.json()).meta[lesson.id]).toBeUndefined();
    expect((await (await handleLessons(req("GET"), store)).json()).lessons).toEqual([]);
  });

  it("code parent : exigé pour modifier si configuré, jamais pour lire", async () => {
    const opts = { parentCode: "1234" };
    expect((await handleLessons(req("POST", { lesson: generated }), store, opts)).status).toBe(401);
    expect((await handleLessons(req("POST", { lesson: generated }, { code: "9999" }), store, opts)).status).toBe(401);
    expect((await handleLessons(req("POST", { lesson: generated }, { code: "1234" }), store, opts)).status).toBe(201);
    expect((await handleLessons(req("GET"), store, opts)).status).toBe(200);
  });

  it("la correction IA retrouve les questions des leçons créées", async () => {
    const { lesson } = await (await handleLessons(req("POST", { lesson: generated }), store)).json();
    let seen;
    const client = { beta: { messages: { create: async (p) => ((seen = p), { stop_reason: "end_turn", content: [{ type: "text", text: '{"score":1,"feedback":"Bravo","found":[],"missing":[]}' }] }) } } };
    const r = await handleGrade(new Request("http://x", { method: "POST", body: JSON.stringify({ lessonId: lesson.id, qid: "s2/q1", answer: "avec être, accord avec le sujet" }) }), { client, store });
    expect(r.status).toBe(200);
    expect(seen.messages[0].content).toContain("Explique quand on accorde");
  });
});

describe("/api/generate", () => {
  const img = { media_type: "image/jpeg", data: "/9j/4AAQSkZJRgABAQ==" };
  const genReq = (body, headers = {}) => new Request("http://x/api/generate", { method: "POST", headers, body: JSON.stringify(body) });

  it("501 sans clé, 401 sans bon code, 400 sans photo valable", async () => {
    expect((await handleGenerate(genReq({ images: [img] }), {})).status).toBe(501);
    expect((await handleGenerate(genReq({ images: [img] }), { apiKey: "k", parentCode: "1" })).status).toBe(401);
    expect((await handleGenerate(genReq({ images: [] }), { apiKey: "k" })).status).toBe(400);
    expect((await handleGenerate(genReq({ images: [{ media_type: "text/html", data: "x" }] }), { apiKey: "k" })).status).toBe(400);
    expect((await handleGenerate(genReq({ images: Array(11).fill(img) }), { apiKey: "k" })).status).toBe(400);
  });

  it("appelle Claude avec les photos et relaie le flux tel quel", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init, body: JSON.parse(init.body) };
      return new Response("event: ping\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    const res = await handleGenerate(genReq({ images: [img, img], notes: "Leçon de 5e" }), { apiKey: "sk-test", fetchImpl, baseUrl: "https://api.test" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/event-stream/);
    expect(await res.text()).toBe("event: ping\ndata: {}\n\n");
    expect(call.url).toBe("https://api.test/v1/messages");
    expect(call.init.headers["x-api-key"]).toBe("sk-test");
    expect(call.init.headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    expect(call.body.model).toBe(MODEL);
    expect(call.body.stream).toBe(true);
    expect(call.body.fallbacks).toBe("default");
    const content = call.body.messages[0].content;
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(content.at(-1).text).toContain("Leçon de 5e");
  });

  it("transmet proprement une erreur de l'API", async () => {
    const fetchImpl = async () => new Response('{"error":{"type":"rate_limit_error"}}', { status: 429 });
    const res = await handleGenerate(genReq({ images: [img] }), { apiKey: "k", fetchImpl });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("ai_error");
  });

  it("les consignes contiennent le format et un exemple complet", () => {
    expect(SYSTEM_PROMPT).toContain('"type":"qcm"');
    expect(SYSTEM_PROMPT).toContain("Les règles de calcul");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(20000);
    expect(buildRequest([img], "").messages[0].content[1].text).not.toContain("precisions");
  });
});
