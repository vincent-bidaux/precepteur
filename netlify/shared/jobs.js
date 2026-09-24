/**
 * Génération de leçons en tâche de fond : la page peut être fermée.
 *
 * La demande part dans l'API Batches d'Anthropic (traitement différé, 50 %
 * moins cher) ; le serveur vérifie ensuite où elle en est — à chaque minute
 * (fonction planifiée jobs-tick) et à chaque ouverture de l'espace parents —
 * et, quand Claude a fini, vérifie / répare la leçon puis l'enregistre en
 * brouillon.
 *
 *   GET    /api/jobs                     → { jobs } (fait avancer les tâches en cours)
 *   POST   /api/jobs { images, notes, children }  → crée une tâche
 *   POST   /api/jobs?id=…&action=retry   → relance une tâche échouée
 *   DELETE /api/jobs?id=…                → arrête la génération et supprime
 *
 * Stockage : "jobs/<id>". Une tâche réussie est supprimée (la leçon existe).
 */
import { CHILD_IDS } from "./children.js";
import { json } from "./log.js";
import { parentCodeOk } from "./auth.js";
import { validateInput, buildParams } from "./generate.js";
import { saveNewLesson } from "./lessons.js";
import { finalText, extractJson } from "../../src/lib/lesson-check.js";
import { costOf } from "../../src/lib/pricing.js";
import { addFailedCost } from "./costs.js";

const MAX_CONTINUATIONS = 3; // reprises après une pause de la recherche web
const STALE_CLAIM_MS = 3 * 60 * 1000;

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Ce que voit le navigateur (sans les photos). */
export const publicJob = ({ params, etag, ...job }) => job;

function labelOf(notes, photos) {
  const text = notes.replace(/\s+/g, " ").trim();
  const short = text.length > 90 ? `${text.slice(0, 90)}…` : text;
  if (photos && short) return `${photos} photo${photos > 1 ? "s" : ""} + « ${short} »`;
  if (photos) return `${photos} photo${photos > 1 ? "s" : ""}`;
  return `« ${short} »`;
}

async function submit(client, jobId, params) {
  const batch = await client.messages.batches.create({ requests: [{ custom_id: jobId, params }] });
  return batch.id;
}

async function listJobs(store) {
  const { blobs } = await store.list({ prefix: "jobs/" });
  const all = await Promise.all(blobs.map((b) => store.getWithMetadata(b.key, { type: "json" })));
  return all.filter(Boolean).map((x) => ({ ...x.data, etag: x.etag })).sort((a, b) => b.createdAt - a.createdAt);
}

/** Écrit la tâche si personne ne l'a modifiée entre-temps. → true si écrit. */
async function casWrite(store, job, next) {
  const { etag, ...clean } = next;
  const res = await store.setJSON(`jobs/${job.id}`, clean, { onlyIfMatch: job.etag });
  return res?.modified !== false;
}

const fail = (job, message) => ({ ...job, status: "echec", error: message, finishedAt: Date.now() });

/** Fait avancer une tâche en cours. Renvoie la tâche à jour (ou null si terminée et supprimée). */
export async function advanceJob(store, client, job) {
  const claimedLongAgo = job.status === "traitement" && Date.now() - (job.claimedAt || 0) > STALE_CLAIM_MS;
  if (job.status !== "en-cours" && !claimedLongAgo) return job;

  const batch = await client.messages.batches.retrieve(job.batchId);
  if (batch.processing_status !== "ended") return job;

  // on « réserve » la tâche pour ne pas la traiter deux fois (fonction planifiée + page ouverte)
  const claimed = { ...job, status: "traitement", claimedAt: Date.now() };
  if (!(await casWrite(store, job, claimed))) return job;
  const fresh = await store.getWithMetadata(`jobs/${job.id}`, { type: "json" });
  const cur = { ...fresh.data, etag: fresh.etag };

  let result = null;
  for await (const r of await client.messages.batches.results(job.batchId)) if (r.custom_id === job.id) result = r.result;

  // chaque réponse de Claude est facturée (moitié prix en batch), même si la leçon échoue ensuite
  if (result?.type === "succeeded") cur.cost = (cur.cost || 0) + costOf(result.message.usage, cur.params.model, { batch: true });

  let next;
  if (!result) next = fail(cur, "Résultat introuvable.");
  else if (result.type === "canceled") next = fail(cur, "Génération arrêtée.");
  else if (result.type === "expired") next = fail(cur, "Claude n'a pas pu traiter la demande à temps (plus de 24 h). Réessaie.");
  else if (result.type === "errored") next = fail(cur, `Erreur de l'IA (${result.error?.error?.type || result.error?.type || "inconnue"}). Réessaie.`);
  else {
    const msg = result.message;
    if (msg.stop_reason === "pause_turn" && (cur.continuations || 0) < MAX_CONTINUATIONS) {
      // la recherche web a fait une pause : on relance la suite de la conversation
      const params = { ...cur.params, messages: [...cur.params.messages, { role: "assistant", content: msg.content }] };
      const batchId = await submit(client, cur.id, params);
      next = { ...cur, status: "en-cours", batchId, params, continuations: (cur.continuations || 0) + 1 };
    } else if (msg.stop_reason === "refusal") next = fail(cur, "Claude a refusé de traiter cette demande.");
    else if (msg.stop_reason === "max_tokens") next = fail(cur, "La leçon générée était trop longue et a été coupée. Réessaie avec moins de contenu.");
    else {
      try {
        const out = await saveNewLesson(
          store,
          extractJson(finalText(msg.content)),
          cur.children,
          { generatedFrom: cur.label, aiCost: { creation: cur.cost || 0, model: cur.params.model } },
          { aiGrading: cur.aiGrading },
        );
        if (out.errors) next = fail(cur, `La leçon générée est incomplète : ${out.errors.slice(0, 3).join(" ; ")}`);
        else {
          await store.delete(`jobs/${cur.id}`);
          return null;
        }
      } catch (e) {
        next = fail(cur, e.message);
      }
    }
  }
  if (next.status === "echec" && cur.cost) await addFailedCost(store, cur.cost).catch(() => {});
  await casWrite(store, cur, next);
  return next;
}

/** Fait avancer toutes les tâches en cours ; les erreurs d'une tâche n'arrêtent pas les autres. */
export async function advanceAll(store, client) {
  const jobs = await listJobs(store);
  const out = [];
  for (const job of jobs) {
    try {
      const j = await advanceJob(store, client, job);
      if (j) out.push(j);
    } catch {
      out.push(job); // réessayé au prochain passage
    }
  }
  return out;
}

export async function handleJobs(req, store, { client, parentCode } = {}) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      const jobs = client ? await advanceAll(store, client) : await listJobs(store);
      return json({ jobs: jobs.map(publicJob), ai: Boolean(client) });
    }
    if (!parentCodeOk(req, parentCode)) return json({ error: "code_parent" }, 401);
    if (!client) return json({ error: "ai_disabled" }, 501);

    if (req.method === "POST" && id && url.searchParams.get("action") === "retry") {
      const cur = await store.getWithMetadata(`jobs/${id}`, { type: "json" });
      if (!cur) return json({ error: "not_found" }, 404);
      if (cur.data.status !== "echec") return json({ error: "not_failed" }, 409);
      // on repart de la demande d'origine (sans les éventuelles reprises)
      const params = { ...cur.data.params, messages: cur.data.params.messages.slice(0, 1) };
      const batchId = await submit(client, id, params);
      const next = { ...cur.data, status: "en-cours", batchId, params, error: undefined, finishedAt: undefined, continuations: 0, cost: 0, createdAt: Date.now() }; // le coût de l'essai raté est déjà compté à part
      await store.setJSON(`jobs/${id}`, next);
      return json({ job: publicJob(next) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const input = validateInput(body);
      if (input.error) return json({ error: input.error }, input.status);
      const children = Array.isArray(body.children) ? body.children.filter((c) => CHILD_IDS.includes(c)) : CHILD_IDS;
      const jobId = `job-${rid()}`;
      const params = buildParams(input.images, input.notes, input.model, input.size);
      const batchId = await submit(client, jobId, params);
      const job = { id: jobId, status: "en-cours", batchId, createdAt: Date.now(), children, photos: input.images.length, label: labelOf(input.notes, input.images.length), model: input.model, aiGrading: input.aiGrading, size: input.size, cost: 0, params, continuations: 0 };
      await store.setJSON(`jobs/${jobId}`, job);
      return json({ job: publicJob(job) }, 202);
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "bad_request" }, 400);
      const cur = await store.getWithMetadata(`jobs/${id}`, { type: "json" });
      if (cur?.data?.batchId && ["en-cours", "traitement"].includes(cur.data.status)) {
        await client.messages.batches.cancel(cur.data.batchId).catch(() => {}); // déjà fini : rien à arrêter
      }
      await store.delete(`jobs/${id}`);
      return json({ ok: true });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    const status = e?.status === 429 ? 429 : 500;
    return json({ error: status === 429 ? "rate_limited" : "server_error", detail: String(e?.message || e) }, status);
  }
}
