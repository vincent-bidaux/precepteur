import { defineConfig } from "vite";
import path from "node:path";

/**
 * En local (npm run dev / npm run preview), sert aussi /api/log et /api/grade
 * avec les mêmes handlers que les fonctions Netlify, sur un stockage fichier
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
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(new URL(req.url, "http://localhost"), {
          method: req.method,
          headers: { "content-type": req.headers["content-type"] || "application/json" },
          body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const pathname = new URL(request.url).pathname;
        const response =
          pathname === "/api/log" ? await handleLog(request, openStore()) : pathname === "/api/grade" ? await handleGrade(request) : new Response("not found", { status: 404 });
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
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
