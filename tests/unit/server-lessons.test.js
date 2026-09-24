import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { handleLessons } from "../../netlify/shared/lessons.js";
import { validateInput, buildParams } from "../../netlify/shared/generate.js";
import { handleJobs, advanceAll } from "../../netlify/shared/jobs.js";
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
    expect(out.meta[out.lesson.id]).toEqual({ children: ["livia"], status: "brouillon", aiGrading: true });
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
    const client = {
      messages: { create: async (p) => ((seen = p), { stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: "text", text: '{"score":1,"feedback":"Bravo","found":[],"missing":[]}' }] }) },
    };
    const grade = () =>
      handleGrade(new Request("http://x", { method: "POST", body: JSON.stringify({ lessonId: lesson.id, qid: "s2/q1", answer: "avec être, accord avec le sujet", child: "livia" }) }), { client, store });
    const r = await grade();
    expect(r.status).toBe(200);
    expect(seen.messages[0].content).toContain("Explique quand on accorde");
    await grade();
    // coûts comptabilisés par leçon et par enfant
    const costs = (await (await handleLessons(req("GET"), store)).json()).costs;
    expect(costs.grading[lesson.id].livia.n).toBe(2);
    expect(costs.grading[lesson.id].livia.usd).toBeCloseTo(2 * (1000 + 200 * 5) / 1e6, 9);
    // correction IA coupée par le parent : refusée, aucun appel, aucun coût
    await handleLessons(req("PUT", { aiGrading: false }, { id: lesson.id }), store);
    seen = null;
    expect((await grade()).status).toBe(403);
    expect(seen).toBeNull();
  });
});

describe("préparation de la demande à Claude", () => {
  const img = { media_type: "image/jpeg", data: "/9j/4AAQSkZJRgABAQ==" };

  it("valide photos et texte", () => {
    expect(validateInput({ images: [] }).error).toBe("no_content");
    expect(validateInput({ notes: "Maths" }).error).toBe("no_content");
    expect(validateInput({ images: [{ media_type: "text/html", data: "x" }] }).error).toBe("bad_image");
    expect(validateInput({ images: Array(11).fill(img) }).error).toBe("too_many_images");
    expect(validateInput({ images: [{ media_type: "image/jpeg", data: "A".repeat(6_000_000) }] }).status).toBe(413);
    expect(validateInput({ notes: "Programme de CM2 : les unités de mesure" })).toEqual({
      images: [],
      notes: "Programme de CM2 : les unités de mesure",
      model: "claude-sonnet-5",
      aiGrading: true,
      size: { length: 3, questions: 40, series: 5 },
    });
    const v = validateInput({ notes: "Programme de CM2 : les unités de mesure", model: "gpt-9", aiGrading: false, size: { length: 9, questions: 1000 } });
    expect(v.model).toBe("claude-sonnet-5"); // modèle inconnu → défaut
    expect(v.aiGrading).toBe(false);
    expect(v.size).toEqual({ length: 3, questions: 80, series: 10 });
  });

  it("photos + consignes + recherche limitée aux sites officiels", () => {
    const p = buildParams([img, img], "Leçon de 5e");
    expect(p.model).toBe("claude-sonnet-5");
    expect(p.output_config).toEqual({ effort: "high" });
    expect(p.stream).toBeUndefined();
    const content = p.messages[0].content;
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
    expect(content.at(-1).text).toContain("Leçon de 5e");
    expect(p.tools.map((t) => t.type)).toEqual(["web_search_20260209", "web_fetch_20260209"]);
    expect(p.tools[0].allowed_domains).toEqual(["education.gouv.fr", "eduscol.education.fr"]);
    expect(content.at(-1).text).toContain("exactement 40 questions au total, réparties en 5 séries");
    // Haiku 4.5 : outils de recherche de base, pas de réglage d'effort
    const h = buildParams([], "Programme de CM2 : les unités de mesure", "claude-haiku-4-5", { length: 1, questions: 20 });
    expect(h.tools.map((t) => t.type)).toEqual(["web_search_20250305", "web_fetch_20250910"]);
    expect(h.output_config).toBeUndefined();
    expect(h.messages[0].content[0].text).toContain("« Très courte »");
    expect(h.messages[0].content[0].text).toContain("exactement 20 questions au total, réparties en 3 séries");
  });

  it("texte seul : Claude rédige le cours, en s'appuyant sur le programme officiel si besoin", () => {
    const p = buildParams([], "Programme de CM2 : les unités de mesure");
    expect(p.messages[0].content).toHaveLength(1);
    expect(p.messages[0].content[0].text).toContain("Pas de photo");
    expect(p.system).toContain("c'est toi qui rédiges le cours complet");
    expect(p.system).toContain("programme officiel");
    expect(p.system).toContain("éduscol");
  });

  it("les consignes contiennent le format et un exemple complet", () => {
    expect(SYSTEM_PROMPT).toContain('"type":"qcm"');
    expect(SYSTEM_PROMPT).toContain("Les règles de calcul");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(20000);
  });
});

/** Faux client Anthropic (API Batches) contrôlable depuis les tests. */
function fakeClient() {
  const batches = new Map();
  let n = 0;
  const api = {
    created: [],
    canceled: [],
    // à définir par le test : (params) => résultat de batch
    outcome: () => ({
      type: "succeeded",
      message: { stop_reason: "end_turn", usage: { input_tokens: 20000, output_tokens: 30000, server_tool_use: { web_search_requests: 2 } }, content: [{ type: "text", text: JSON.stringify(generated) }] },
    }),
    done: true,
    messages: {
      batches: {
        create: async ({ requests }) => {
          const id = `b${++n}`;
          batches.set(id, requests[0]);
          api.created.push(requests[0]);
          return { id, processing_status: "in_progress" };
        },
        retrieve: async (id) => ({ id, processing_status: api.done ? "ended" : "in_progress" }),
        results: async (id) => [{ custom_id: batches.get(id).custom_id, result: api.outcome(batches.get(id).params) }],
        cancel: async (id) => (api.canceled.push(id), { id, processing_status: "canceling" }),
      },
    },
  };
  return api;
}

describe("/api/jobs (génération en tâche de fond)", () => {
  let store;
  beforeEach(() => (store = freshStore()));
  const jreq = (method, body, q = "") => new Request(`http://x/api/jobs${q}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const create = async (client, notes = "Programme de CM2 : les unités de mesure", children = ["livia"]) => (await (await handleJobs(jreq("POST", { notes, children }), store, { client })).json()).job;

  it("crée une tâche, la page peut se fermer, la leçon arrive en brouillon", async () => {
    const client = fakeClient();
    client.done = false;
    const job = await create(client);
    expect(job.status).toBe("en-cours");
    expect(job.label).toContain("unités de mesure");
    expect(job.params).toBeUndefined(); // les photos ne repartent pas vers le navigateur
    expect(client.created[0].custom_id).toBe(job.id);
    // pas encore fini
    let list = await (await handleJobs(jreq("GET"), store, { client })).json();
    expect(list.jobs.map((j) => j.status)).toEqual(["en-cours"]);
    // fini : la leçon est enregistrée (réparée) pour Livia, la tâche disparaît
    client.done = true;
    await advanceAll(store, client);
    list = await (await handleJobs(jreq("GET"), store, { client })).json();
    expect(list.jobs).toEqual([]);
    const lessons = await (await handleLessons(req("GET"), store)).json();
    const l = lessons.lessons[0];
    expect(l.title).toBe("L'accord du participe passé");
    expect(l.generatedFrom).toContain("unités de mesure");
    expect(l.checkNotes.join("\n")).toMatch(/corrigé 20 → 14/);
    expect(lessons.meta[l.id]).toEqual({ children: ["livia"], status: "brouillon", aiGrading: true });
  });

  it("le texte final est pris après la recherche web", async () => {
    const client = fakeClient();
    client.outcome = () => ({
      type: "succeeded",
      message: {
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "Je cherche {le programme}." },
          { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
          { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
          { type: "text", text: JSON.stringify(generated).slice(0, 50) },
          { type: "text", text: JSON.stringify(generated).slice(50) },
        ],
      },
    });
    await create(client);
    await advanceAll(store, client);
    expect((await (await handleLessons(req("GET"), store)).json()).lessons).toHaveLength(1);
  });

  it("reprend après une pause de la recherche web", async () => {
    const client = fakeClient();
    client.outcome = (params) =>
      params.messages.length === 1
        ? { type: "succeeded", message: { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }] } }
        : { type: "succeeded", message: { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(generated) }] } };
    await create(client);
    let jobs = await advanceAll(store, client);
    expect(jobs[0].status).toBe("en-cours");
    expect(client.created[1].params.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    jobs = await advanceAll(store, client);
    expect(jobs).toEqual([]);
  });

  it("échecs lisibles, puis « Réessayer » repart de la demande d'origine", async () => {
    const client = fakeClient();
    client.outcome = () => ({ type: "succeeded", message: { stop_reason: "refusal", content: [] } });
    const job = await create(client);
    let [j] = await advanceAll(store, client);
    expect(j.status).toBe("echec");
    expect(j.error).toMatch(/refusé/);
    client.outcome = () => ({ type: "errored", error: { type: "error", error: { type: "overloaded_error" } } });
    const r = await handleJobs(jreq("POST", undefined, `?id=${job.id}&action=retry`), store, { client });
    expect((await r.json()).job.status).toBe("en-cours");
    expect(client.created.at(-1).params.messages).toHaveLength(1);
    [j] = await advanceAll(store, client);
    expect(j.error).toMatch(/overloaded_error/);
    client.outcome = () => ({ type: "succeeded", message: { stop_reason: "end_turn", content: [{ type: "text", text: "Désolé, pas de leçon." }] } });
    await handleJobs(jreq("POST", undefined, `?id=${job.id}&action=retry`), store, { client });
    [j] = await advanceAll(store, client);
    expect(j.error).toMatch(/lisible/);
  });

  it("« Arrêter et supprimer » annule le traitement chez Claude", async () => {
    const client = fakeClient();
    client.done = false;
    const job = await create(client);
    const r = await handleJobs(jreq("DELETE", undefined, `?id=${job.id}`), store, { client });
    expect(r.status).toBe(200);
    expect(client.canceled).toHaveLength(1);
    expect((await (await handleJobs(jreq("GET"), store, { client })).json()).jobs).toEqual([]);
  });

  it("traitée une seule fois même si deux vérifications se croisent", async () => {
    const client = fakeClient();
    await create(client);
    await Promise.all([advanceAll(store, client), advanceAll(store, client), advanceAll(store, client)]);
    expect((await (await handleLessons(req("GET"), store)).json()).lessons).toHaveLength(1);
  });

  it("modèle choisi, correction IA coupée, coût de création enregistré sur la leçon", async () => {
    const client = fakeClient();
    await handleJobs(jreq("POST", { notes: "Programme de CM2 : les unités de mesure", model: "claude-opus-5", aiGrading: false, size: { length: 2, questions: 20 } }), store, { client });
    const params = client.created[0].params;
    expect(params.model).toBe("claude-opus-5");
    expect(params.messages[0].content[0].text).toContain("exactement 20 questions");
    await advanceAll(store, client);
    const { lessons, meta } = await (await handleLessons(req("GET"), store)).json();
    const l = lessons[0];
    expect(meta[l.id].aiGrading).toBe(false);
    // Opus 5 en batch : (20 000 × 5 + 30 000 × 25) / 1e6 / 2 + 2 recherches × 0,01 $
    expect(l.aiCost.model).toBe("claude-opus-5");
    expect(l.aiCost.creation).toBeCloseTo((20000 * 5 + 30000 * 25) / 1e6 / 2 + 0.02, 9);
  });

  it("une création ratée est quand même comptée (une seule fois, même après « Réessayer »)", async () => {
    const client = fakeClient();
    client.outcome = () => ({ type: "succeeded", message: { stop_reason: "end_turn", usage: { input_tokens: 1_000_000, output_tokens: 0 }, content: [{ type: "text", text: "rien" }] } });
    const job = await create(client);
    let [j] = await advanceAll(store, client);
    expect(j.status).toBe("echec");
    expect(j.cost).toBeCloseTo(1, 9); // Sonnet 5 : 2 $/M en entrée, moitié prix
    await advanceAll(store, client); // pas de double comptage
    let costs = (await (await handleLessons(req("GET"), store)).json()).costs;
    expect(costs.failed).toBeCloseTo(1, 9);
    await handleJobs(jreq("POST", undefined, `?id=${job.id}&action=retry`), store, { client });
    [j] = await advanceAll(store, client);
    costs = (await (await handleLessons(req("GET"), store)).json()).costs;
    expect(costs.failed).toBeCloseTo(2, 9);
    expect(j.cost).toBeCloseTo(1, 9);
  });

  it("sans clé : 501 ; code parent exigé pour créer ; la liste reste lisible", async () => {
    expect((await handleJobs(jreq("POST", { notes: "Programme de CM2 : les unités" }), store, {})).status).toBe(501);
    expect((await handleJobs(jreq("POST", { notes: "Programme de CM2 : les unités" }), store, { client: fakeClient(), parentCode: "1" })).status).toBe(401);
    expect((await handleJobs(jreq("POST", { notes: "court" }), store, { client: fakeClient() })).status).toBe(400);
    expect((await handleJobs(jreq("GET"), store, {})).status).toBe(200);
  });
});
