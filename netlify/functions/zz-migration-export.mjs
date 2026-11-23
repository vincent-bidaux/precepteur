// TEMPORAIRE : export des données pour la migration vers Cloudflare (supprimé juste après).
import { getStore, listStores } from "@netlify/blobs";

const K = "9641b562ab18deb9d22a11ff2acc3f88f063a525c8ebb5c814e04e9c57f3e5c4";

export const config = { path: "/__migration-export" };

export default async (req) => {
  if (new URL(req.url).searchParams.get("k") !== K) return new Response("not found", { status: 404 });
  const { stores } = await listStores();
  const names = [...new Set(["precepteur", ...stores])];
  const out = { exportedAt: new Date().toISOString(), stores: {} };
  for (const name of names) {
    const store = getStore({ name, consistency: "strong" });
    const { blobs } = await store.list();
    const items = [];
    for (const b of blobs) {
      const r = await store.getWithMetadata(b.key, { type: "arrayBuffer" });
      if (!r) continue;
      items.push({ key: b.key, etag: r.etag, metadata: r.metadata, base64: Buffer.from(r.data).toString("base64") });
    }
    out.stores[name] = items;
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
};
