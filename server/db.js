/**
 * Accès au stockage. En production : Cloudflare R2 (bucket "precepteur-data",
 * binding PRECEPTEUR_DATA, cohérence forte, écritures conditionnelles par
 * etag). En local / tests : si PRECEPTEUR_FS_STORE est défini, un dossier
 * de fichiers JSON qui imite la même API (get + etag, set conditionnel,
 * list par préfixe).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const etagOf = (text) => crypto.createHash("sha1").update(text).digest("hex");

function fileStore(dir) {
  const fileFor = (key) => path.join(dir, encodeURIComponent(key) + ".json");
  // une écriture conditionnelle doit être atomique (comme côté Blobs) :
  // on sérialise les écritures par clé
  const locks = new Map();
  const withLock = (key, fn) => {
    const run = (locks.get(key) || Promise.resolve()).then(fn, fn);
    locks.set(key, run.catch(() => {}));
    return run;
  };
  return {
    async getWithMetadata(key) {
      try {
        const text = await fs.readFile(fileFor(key), "utf8");
        return { data: JSON.parse(text), etag: etagOf(text) };
      } catch {
        return null;
      }
    },
    setJSON(key, value, opts = {}) {
      return withLock(key, async () => {
        await fs.mkdir(dir, { recursive: true });
        const current = await this.getWithMetadata(key);
        if (opts.onlyIfNew && current) return { modified: false };
        if (opts.onlyIfMatch && (!current || current.etag !== opts.onlyIfMatch)) return { modified: false };
        const text = JSON.stringify(value);
        const tmp = fileFor(key) + "." + process.pid + ".tmp";
        await fs.writeFile(tmp, text);
        await fs.rename(tmp, fileFor(key));
        return { modified: true, etag: etagOf(text) };
      });
    },
    delete(key) {
      return withLock(key, () => fs.rm(fileFor(key), { force: true }));
    },
    async list({ prefix = "" } = {}) {
      let names = [];
      try {
        names = await fs.readdir(dir);
      } catch {
        /* dossier absent = store vide */
      }
      const blobs = names
        .filter((n) => n.endsWith(".json"))
        .map((n) => ({ key: decodeURIComponent(n.slice(0, -5)) }))
        .filter((b) => b.key.startsWith(prefix));
      return { blobs };
    },
  };
}

/** Même API sur un bucket R2 (lecture après écriture garantie, put conditionnel atomique). */
export function r2Store(bucket) {
  return {
    async getWithMetadata(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { data: JSON.parse(await obj.text()), etag: obj.etag };
    },
    async setJSON(key, value, opts = {}) {
      let onlyIf;
      if (opts.onlyIfNew) onlyIf = new Headers({ "If-None-Match": "*" });
      else if (opts.onlyIfMatch) onlyIf = { etagMatches: opts.onlyIfMatch };
      const res = await bucket.put(key, JSON.stringify(value), {
        httpMetadata: { contentType: "application/json" },
        ...(onlyIf ? { onlyIf } : {}),
      });
      // put conditionnel refusé → null
      return res ? { modified: true, etag: res.etag } : { modified: false };
    },
    delete(key) {
      return bucket.delete(key);
    },
    async list({ prefix = "" } = {}) {
      const blobs = [];
      let cursor;
      do {
        const page = await bucket.list({ prefix, cursor });
        blobs.push(...page.objects.map((o) => ({ key: o.key })));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return { blobs };
    },
  };
}

/**
 * env : bindings du Worker (PRECEPTEUR_DATA = bucket R2) ; en local / tests,
 * process.env avec PRECEPTEUR_FS_STORE (dossier de fichiers JSON).
 */
export function openStore(env = process.env) {
  const dir = env?.PRECEPTEUR_FS_STORE || process.env.PRECEPTEUR_FS_STORE;
  if (dir) return fileStore(dir);
  if (env?.PRECEPTEUR_DATA) return r2Store(env.PRECEPTEUR_DATA);
  throw new Error("Aucun stockage configuré (binding R2 PRECEPTEUR_DATA ou PRECEPTEUR_FS_STORE)");
}
