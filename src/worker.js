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

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
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
