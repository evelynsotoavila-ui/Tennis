import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const store = new Map();
const pending = new Map();
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.cache/tennis.json");

loadDisk();

function loadDisk() {
  try {
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [key, entry] of Object.entries(rows)) {
      if (entry && Object.prototype.hasOwnProperty.call(entry, "value")) store.set(key, entry);
    }
  } catch {
    // La caché en disco es opcional. Si no existe, la primera consulta la crea.
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const rows = Object.fromEntries(store);
    fs.writeFileSync(file, JSON.stringify(rows));
  } catch {
    // Si el disco no deja escribir, la caché en memoria sigue valiendo.
  }
}

export async function cached(key, ttlMs, producer) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const current = pending.get(key);
  if (current) return current;

  const job = (async () => {
    try {
      const value = await producer();
      store.set(key, { value, expires: Date.now() + ttlMs });
      persist();
      return value;
    } catch (error) {
      if (hit && error?.status === 429) return hit.value;
      throw error;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, job);
  return job;
}

export function cacheSize() {
  return store.size;
}
