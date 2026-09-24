import { defineConfig } from "vite";
import path from "node:path";

/**
 * En local (npm run dev / npm run preview), sert aussi /api/* avec les mêmes
 * handlers que les fonctions Netlify, sur un stockage fichier
 * (.data/) au lieu de Netlify Blobs. Pas besoin de netlify-cli pour tester.
 */
function localApi() {
  const attach = (server) => {
    process.env.PRECEPTEUR_FS_STORE ||= path.resolve(".data");
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith("/api/")) return next();
      try {
        const { openStore } = await import("./netlify/shared/db.js");
        const { handleLog } = await import("./netlify/shared/log.js");
        const { handleGrade } = await import("./netlify/shared/grade.js");
        const { handleLessons } = await import("./netlify/shared/lessons.js");
        const { handleJobs } = await import("./netlify/shared/jobs.js");
        const { anthropicClient } = await import("./netlify/shared/ai.js");
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(new URL(req.url, "http://localhost"), {
          method: req.method,
          headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => ["content-type", "x-parent-code"].includes(k))),
          body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const env = process.env;
        const routes = {
          "/api/log": () => handleLog(request, openStore()),
          "/api/grade": () => handleGrade(request, { client: anthropicClient(env), store: openStore() }),
          "/api/lessons": () => handleLessons(request, openStore(), { parentCode: env.PRECEPTEUR_CODE_PARENT }),
          "/api/jobs": () => handleJobs(request, openStore(), { client: anthropicClient(env), parentCode: env.PRECEPTEUR_CODE_PARENT }),
        };
        const pathname = new URL(request.url).pathname;
        const response = routes[pathname] ? await routes[pathname]() : new Response("not found", { status: 404 });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        if (response.body) for await (const chunk of response.body) res.write(chunk);
        res.end();
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
  };
  return { name: "precepteur-local-api", configureServer: attach, configurePreviewServer: attach };
}

export default defineConfig({
  plugins: [localApi()],
  build: { outDir: "dist" },
  test: { include: ["tests/unit/**/*.test.js"] },
});
