/**
 * Accès au stockage. En production : Netlify Blobs (store "precepteur",
 * cohérence forte). En local / tests : si PRECEPTEUR_FS_STORE est défini,
 * un dossier de fichiers JSON qui imite la même API (get + etag, set
 * conditionnel, list par préfixe).
 */
import { getStore } from "@netlify/blobs";
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

export function openStore() {
  const dir = process.env.PRECEPTEUR_FS_STORE;
  if (dir) return fileStore(dir);
  // cohérence forte : une lecture juste après une écriture doit la voir
  return getStore({ name: "precepteur", consistency: "strong" });
}
