/**
 * Journal d'activité côté client.
 *
 * Chaque évènement (série terminée, visite d'une page) est un « record » avec
 * un id unique. Il est d'abord gardé localement (file d'attente), puis envoyé à
 * /api/log. Si le réseau ou le serveur manquent, rien n'est perdu : la file
 * est renvoyée plus tard, et le serveur ignore les doublons (même id).
 * Le serveur est la référence partagée entre ordinateur et téléphone.
 */
import { lsGet, lsSet } from "./storage.js";

const K_CACHE = "precepteur:records"; // dernière copie connue du serveur
const K_QUEUE = "precepteur:queue"; // records pas encore confirmés par le serveur
const K_DEVICE = "precepteur:device";

export const API = "/api/log";

export function uid() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Date.now().toString(36) + "-" + [...a].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export function deviceName() {
  let d = lsGet(K_DEVICE, null);
  if (!d) {
    const ua = navigator.userAgent;
    const kind = /iPhone|Android.+Mobile/.test(ua) ? "mobile" : /iPad|Android|Tablet/.test(ua) ? "tablette" : "ordinateur";
    d = `${kind}-${uid().slice(-4)}`;
    lsSet(K_DEVICE, d);
  }
  return d;
}

const queue = () => lsGet(K_QUEUE, []);

let flushing = null;
export function flush() {
  if (flushing) return flushing;
  const pending = queue();
  if (!pending.length) return Promise.resolve(true);
  flushing = fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: pending }),
    keepalive: JSON.stringify(pending).length < 60000,
  })
    .then((res) => {
      if (!res.ok) return false;
      // retire de la file ce qui a été envoyé (le reste a pu arriver entre-temps)
      const sent = new Set(pending.map((r) => r.id));
      const rest = queue().filter((r) => !sent.has(r.id));
      lsSet(K_QUEUE, rest);
      lsSet(K_CACHE, mergeRecords(lsGet(K_CACHE, []), pending));
      return true;
    })
    .catch(() => false)
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

export function record(rec) {
  const full = { id: uid(), ts: Date.now(), device: deviceName(), ...rec };
  lsSet(K_QUEUE, [...queue(), full]);
  flush();
  return full;
}

export function mergeRecords(...lists) {
  const byId = new Map();
  for (const list of lists) for (const r of list || []) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}

/**
 * Charge tout l'historique (serveur + ce qui n'est pas encore parti).
 * → { records, online } ; online=false si on a dû se contenter du cache local.
 */
export async function loadRecords() {
  await flush();
  try {
    const res = await fetch(API, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const { records } = await res.json();
    lsSet(K_CACHE, records);
    return { records: mergeRecords(records, queue()), online: true };
  } catch {
    return { records: mergeRecords(lsGet(K_CACHE, []), queue()), online: false };
  }
}

export const pendingCount = () => queue().length;
