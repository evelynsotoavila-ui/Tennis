import { RAPIDAPI_HOST, RAPIDAPI_KEY } from "./env.js";

const BASE = `https://${RAPIDAPI_HOST}`;
const inflight = new Map();
let queue = Promise.resolve();
let pauseUntil = 0;

export class RapidError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "RapidError";
    this.status = status;
    this.code = code;
  }
}

export function assertConfigured() {
  if (!RAPIDAPI_KEY) {
    throw new RapidError(
      "Falta RAPIDAPI_KEY. Agrégala en .env (local) o en las variables de Render.",
      503,
      "MISSING_KEY",
    );
  }
}

function messageForStatus(status, body) {
  if (status === 401 || status === 403) {
    return "RapidAPI rechazó la clave o el plan no incluye TennisApi.";
  }
  if (status === 429) {
    return "RapidAPI limitó las consultas. Espera un momento y vuelve a intentar.";
  }
  if (status === 404) return "TennisApi no encontró ese recurso.";
  const upstream = body?.message || body?.error;
  if (typeof upstream === "string" && upstream.length < 180) return upstream;
  return `TennisApi respondió ${status}.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetSeconds(response) {
  const reset = Number(response.headers.get("x-ratelimit-requests-reset"));
  if (!Number.isFinite(reset) || reset <= 0) return 0;
  return reset;
}

function quotaMessage(response) {
  const seconds = resetSeconds(response);
  const limit = response.headers.get("x-ratelimit-requests-limit");
  const cupo = limit && /^\d+$/.test(limit) ? limit : "50";
  if (seconds >= 3600) {
    const hours = Math.max(1, Math.round(seconds / 3600));
    return `TennisApi agotó las ${cupo} consultas de este periodo. Vuelven en unas ${hours} horas.`;
  }
  if (seconds >= 60) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `TennisApi agotó las consultas de este tramo. Vuelven en unos ${minutes} minutos.`;
  }
  return "RapidAPI limitó las consultas. Espera un momento y vuelve a intentar.";
}

function noteLimits(response) {
  const remaining = Number(response.headers.get("x-ratelimit-requests-remaining"));
  const seconds = resetSeconds(response);
  if (remaining === 0 && seconds > 0 && seconds <= 90) {
    pauseUntil = Math.max(pauseUntil, Date.now() + seconds * 1000 + 400);
  }
}

async function fetchOnce(pathname, retried) {
  const wait = pauseUntil - Date.now();
  if (wait > 0) await sleep(Math.min(wait, 95_000));

  assertConfigured();
  const response = await fetch(`${BASE}${pathname}`, {
    headers: {
      accept: "application/json",
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": RAPIDAPI_KEY,
    },
  });
  noteLimits(response);

  if (response.status === 429) {
    const seconds = resetSeconds(response);
    await response.arrayBuffer().catch(() => {});
    if (!retried && seconds > 0 && seconds <= 90) {
      const pause = seconds * 1000 + 400;
      pauseUntil = Math.max(pauseUntil, Date.now() + pause);
      await sleep(pause);
      return fetchOnce(pathname, true);
    }
    throw new RapidError(quotaMessage(response), 429, "UPSTREAM");
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 180) };
    }
  }

  if (!response.ok) {
    throw new RapidError(messageForStatus(response.status, body), response.status, "UPSTREAM");
  }

  return body;
}

export function rapidGet(pathname) {
  const current = inflight.get(pathname);
  if (current) return current;

  const run = queue.then(() => fetchOnce(pathname, false));
  queue = run.then(
    () => {},
    () => {},
  );
  inflight.set(pathname, run);
  run.finally(() => {
    if (inflight.get(pathname) === run) inflight.delete(pathname);
  }).catch(() => {});
  return run;
}
