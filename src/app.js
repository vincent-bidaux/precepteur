// État partagé de l'application (journal chargé) et navigation.
import { loadRecords, mergeRecords } from "./lib/store.js";
import { loadCatalog } from "./catalog.js";

export const state = {
  records: [],
  online: true,
  loaded: false,
};

export function addLocalRecord(rec) {
  state.records = mergeRecords(state.records, [rec]);
}

export async function refresh() {
  const [{ records, online }] = await Promise.all([loadRecords(), loadCatalog()]);
  state.records = records;
  state.online = online;
  state.loaded = true;
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
