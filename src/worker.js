/**
 * Worker Cloudflare : sert l'API (/api/*) et laisse le reste aux fichiers
 * statiques (dist/, binding ASSETS). Le cron (chaque minute) fait avancer
 * les leçons en cours de création, même si personne n'a l'espace parents ouvert.
 */
import { openStore } from "../server/db.js";
import { handleLog } from "../server/log.js";
import { handleGrade } from "../server/grade.js";
import { handleLessons } from "../server/lessons.js";
import { handleJobs, advanceAll } from "../server/jobs.js";
import { anthropicClient } from "../server/ai.js";

const routes = {
  "/api/log": (req, env) => handleLog(req, openStore(env)),
  "/api/grade": (req, env) => handleGrade(req, { client: anthropicClient(env), store: openStore(env) }),
  "/api/lessons": (req, env) => handleLessons(req, openStore(env), { parentCode: env.PRECEPTEUR_CODE_PARENT }),
  "/api/jobs": (req, env) => handleJobs(req, openStore(env), { client: anthropicClient(env), parentCode: env.PRECEPTEUR_CODE_PARENT }),
};

// TEMPORAIRE (migration) : réimport des données exportées de Netlify Blobs. Retiré juste après.
const IMPORT_HASH = "64f92832e3138de6e9e60e9d425a8ac92479d1e76c753331551fdc8128d14729";
async function migrationImport(req, env) {
  const k = new URL(req.url).searchParams.get("k") || "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (req.method !== "POST" || hex !== IMPORT_HASH) return new Response("not found", { status: 404 });
  const { items } = await req.json();
  const written = [];
  for (const it of items) {
    const bytes = Uint8Array.from(atob(it.base64), (c) => c.charCodeAt(0));
    await env.PRECEPTEUR_DATA.put(it.key, bytes, { httpMetadata: { contentType: "application/json" } });
    written.push({ key: it.key, bytes: bytes.length });
  }
  const listed = await openStore(env).list();
  return Response.json({ written, total: listed.blobs.length });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === "/__migration-import") return migrationImport(req, env);
    const route = routes[pathname];
    if (route) return route(req, env);
    if (pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
    return env.ASSETS.fetch(req);
  },

  async scheduled(_controller, env) {
    const client = anthropicClient(env);
    if (client) await advanceAll(openStore(env), client);
  },
};
