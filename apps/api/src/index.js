import express from "express";
import fs from "node:fs";
import path from "node:path";
import { cached } from "./cache.js";
import { ClaudeError, completeText } from "./claude.js";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, CORS_ORIGIN, PORT, RAPIDAPI_HOST, RAPIDAPI_KEY, WEB_DIST } from "./env.js";
import {
  attachPreviews,
  extractCategories,
  extractEvents,
  extractH2H,
  extractMarkets,
  extractOddsPreview,
  extractRankings,
  extractSearch,
  extractStatistics,
  splitDate,
} from "./normalize.js";
import {
  buildBrief,
  calibrate,
  forecastPrompt,
  formLine,
  localForecast,
  parseModelJson,
  systemPrompt,
} from "./forecast.js";
import { RapidError, rapidGet } from "./rapid.js";

const app = express();
const hits = new Map();

app.disable("x-powered-by");

if (CORS_ORIGIN) {
  const allowed = new Set(
    CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowed.has("*") || allowed.has(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cancha-api",
    rapidHost: RAPIDAPI_HOST,
    rapidConfigured: Boolean(RAPIDAPI_KEY),
    claudeConfigured: Boolean(ANTHROPIC_API_KEY),
  });
});

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "local")
    .split(",")[0]
    .trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 80) {
    res.status(429).json({ error: "Demasiadas consultas. Espera un minuto." });
    return;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  next();
});

async function readOrThrow(pathname, ttlMs) {
  return cached(pathname, ttlMs, () => rapidGet(pathname));
}

app.get("/api/matches", async (req, res, next) => {
  try {
    const parts = splitDate(req.query.date);
    if (!parts) {
      res.status(400).json({ error: "Usa una fecha con formato YYYY-MM-DD." });
      return;
    }
    const { day, month, year } = parts;
    const schedule = await loadSchedule(day, month, year);
    res.json(schedule);
  } catch (error) {
    next(error);
  }
});

async function loadSchedule(day, month, year) {
  const oddsPath = `/api/tennis/events/odds/${day}/${month}/${year}`;
  let oddsPayload = null;
  try {
    oddsPayload = await readOrThrow(oddsPath, 2 * 60 * 60_000);
  } catch (error) {
    if (!shouldFallback(error)) throw error;
  }

  let events = extractEvents(oddsPayload);
  let source = events.length ? "odds" : "";

  if (events.length === 0) {
    try {
      events = extractEvents(await readOrThrow(`/api/tennis/events/${day}/${month}/${year}`, 2 * 60 * 60_000));
      if (events.length) source = "schedule";
    } catch (error) {
      if (!shouldFallback(error)) throw error;
    }
  }

  let notice = null;
  if (events.length === 0) {
    const categories = extractCategories(
      await readOrThrow(`/api/tennis/calendar/${day}/${month}/${year}/categories`, 6 * 60 * 60_000),
    ).slice(0, 12);
    let limited = false;
    const batches = await mapPool(categories, 2, async (category) => {
      try {
        return extractEvents(
          await readOrThrow(`/api/tennis/category/${category.id}/events/${day}/${month}/${year}`, 2 * 60 * 60_000),
        );
      } catch (error) {
        if (error instanceof RapidError && error.status === 429) {
          limited = true;
          return [];
        }
        if (shouldFallback(error) || error.status === 204) return [];
        throw error;
      }
    });
    const seen = new Set();
    events = batches.flat().filter((match) => {
      if (!match.id || seen.has(match.id)) return false;
      seen.add(match.id);
      return true;
    });
    events.sort((a, b) => (a.startTimestamp || 0) - (b.startTimestamp || 0));
    source = "categories";
    if (!events.length && limited) {
      throw new RapidError("RapidAPI limitó las consultas. Espera un momento y vuelve a intentar.", 429, "UPSTREAM");
    }
    if (limited) notice = "La agenda está incompleta: RapidAPI limitó parte de las categorías.";
  }

  return {
    date: iso(year, month, day),
    source,
    notice,
    events: attachPreviews(events, extractOddsPreview(oddsPayload)),
  };
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function shouldFallback(error) {
  return error instanceof RapidError && (error.status === 404 || error.status === 410);
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

app.get("/api/live", async (_req, res, next) => {
  try {
    const payload = await readOrThrow("/api/tennis/events/live", 60_000);
    res.json({ source: "live", events: extractEvents(payload) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/matches/:id", async (req, res, next) => {
  try {
    const id = numericId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "El partido no es válido." });
      return;
    }

    const view = await loadMatchView(id);
    if (!view) {
      res.status(404).json({ error: "No encontré ese partido." });
      return;
    }
    res.json(view);
  } catch (error) {
    next(error);
  }
});

app.get("/api/matches/:id/forecast", async (req, res, next) => {
  try {
    const id = numericId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "El partido no es válido." });
      return;
    }
    const view = await loadMatchView(id);
    if (!view) {
      res.status(404).json({ error: "No encontré ese partido." });
      return;
    }
    const [homeForm, awayForm] = await Promise.all([
      recentForm(view.match.home.id, id),
      recentForm(view.match.away.id, id),
    ]);
    const brief = buildBrief(view, { home: homeForm, away: awayForm });
    const stamp = [
      brief.match.status,
      brief.match.homeSets.join("-"),
      brief.match.awaySets.join("-"),
      brief.match.homePoints || "",
      brief.match.awayPoints || "",
    ].join(":");
    const ttl = brief.match.status === "inprogress" ? 2 * 60_000 : brief.match.status === "finished" ? 12 * 60 * 60_000 : 20 * 60_000;
    const forecast = await cached(`forecast:${id}:${stamp}`, ttl, async () => {
      noteForecast(req);
      try {
        const text = await completeText(systemPrompt(), forecastPrompt(brief));
        return {
          ...calibrate(parseModelJson(text), brief.market, brief.match.status),
          source: "claude",
          model: ANTHROPIC_MODEL,
        };
      } catch (error) {
        if (error instanceof ClaudeError) return localForecast(brief);
        throw error;
      }
    });
    res.json(forecast);
  } catch (error) {
    next(error);
  }
});

const forecastHits = new Map();

function noteForecast(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "local")
    .split(",")[0]
    .trim();
  const now = Date.now();
  const recent = (forecastHits.get(ip) || []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 8) {
    const error = new Error("Demasiados pronósticos. Espera un minuto.");
    error.status = 429;
    throw error;
  }
  recent.push(now);
  forecastHits.set(ip, recent);
}

async function loadMatchView(id) {
  const [eventResult, oddsResult, statsResult] = await Promise.allSettled([
    readOrThrow(`/api/tennis/event/${id}`, 5 * 60_000),
    loadOdds(id),
    readOrThrow(`/api/tennis/event/${id}/statistics`, 5 * 60_000),
  ]);
  if (eventResult.status === "rejected") throw eventResult.reason;
  const events = extractEvents(eventResult.value?.event ? { events: [eventResult.value.event] } : eventResult.value);
  const match = events[0] || null;
  if (!match) return null;

  let h2h = { homeWins: null, awayWins: null, draws: null, recent: [] };
  if (match.customId) {
    try {
      const payload = await readOrThrow(`/api/tennis/event/${encodeURIComponent(match.customId)}/h2h`, 5 * 60_000);
      h2h = extractH2H(payload);
    } catch (error) {
      if (!shouldFallback(error) && error.status !== 204) h2h = { ...h2h, error: error.message };
    }
  }

  return {
    match,
    odds: oddsResult.status === "fulfilled" ? oddsResult.value : { markets: [], error: oddsResult.reason.message },
    statistics: statsResult.status === "fulfilled" ? extractStatistics(statsResult.value) : [],
    statisticsError: statsResult.status === "rejected" ? quiet(statsResult.reason) : null,
    h2h,
  };
}

async function recentForm(playerId, currentId) {
  if (!playerId) return [];
  try {
    const payload = await readOrThrow(`/api/tennis/team/${playerId}/events/previous/0`, 10 * 60_000);
    return extractEvents(payload)
      .filter((match) => String(match.id) !== String(currentId))
      .slice(0, 5)
      .map((match) => formLine(match, playerId));
  } catch (error) {
    if (shouldFallback(error) || error.status === 204) return [];
    return [];
  }
}

async function loadOdds(id) {
  const attempts = [
    [`/api/tennis/event/${id}/odds`, "getMatchBettingOdds"],
    [`/api/tennis/event/${id}/odds/1/all`, "all"],
    [`/api/tennis/event/${id}/odds/1/featured`, "featured"],
  ];
  for (const [pathname, source] of attempts) {
    try {
      const markets = extractMarkets(await readOrThrow(pathname, 45_000));
      if (markets.length > 0) return { providerId: 1, source, markets };
    } catch (error) {
      if (error instanceof RapidError && [401, 403, 429, 503].includes(error.status)) throw error;
    }
  }
  return { providerId: 1, source: "getMatchBettingOdds", markets: [] };
}

function quiet(error) {
  if (error instanceof RapidError && (error.status === 204 || error.status === 404)) return null;
  return error.message;
}

app.get("/api/rankings/:tour", async (req, res, next) => {
  try {
    const tours = {
      atp: "/api/tennis/rankings/atp",
      wta: "/api/tennis/rankings/wta",
      "atp-live": "/api/tennis/rankings/atp/live",
      "wta-live": "/api/tennis/rankings/wta/live",
    };
    const pathname = tours[req.params.tour];
    if (!pathname) {
      res.status(400).json({ error: "El circuito debe ser atp, wta, atp-live o wta-live." });
      return;
    }
    const payload = await readOrThrow(pathname, 12 * 60 * 60_000);
    res.json({ tour: req.params.tour, rankings: extractRankings(payload).slice(0, 100) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/search", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) {
      res.status(400).json({ error: "Escribe al menos 2 caracteres." });
      return;
    }
    if (query.length > 40) {
      res.status(400).json({ error: "La búsqueda es demasiado larga." });
      return;
    }
    const payload = await readOrThrow(`/api/tennis/search/${encodeURIComponent(query)}`, 5 * 60_000);
    res.json({ query, results: extractSearch(payload).slice(0, 20) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/entity/:type/:id", async (req, res, next) => {
  try {
    const id = numericId(req.params.id);
    const type = req.params.type === "player" ? "player" : req.params.type === "team" ? "team" : null;
    if (!id || !type) {
      res.status(400).json({ error: "La ficha no es válida." });
      return;
    }

    const profilePath = type === "player" ? `/api/tennis/player/${id}` : `/api/tennis/team/${id}`;
    const nearPath = type === "player" ? `/api/tennis/player/${id}/events/near` : `/api/tennis/team/${id}/events/near`;
    const [profileResult, nearResult] = await Promise.allSettled([
      readOrThrow(profilePath, 10 * 60_000),
      readOrThrow(nearPath, 60_000),
    ]);

    if (
      profileResult.status === "rejected" &&
      type === "player" &&
      profileResult.reason instanceof RapidError &&
      profileResult.reason.status === 404
    ) {
      const teamProfile = await readOrThrow(`/api/tennis/team/${id}`, 10 * 60_000);
      const teamNear = await readOrThrow(`/api/tennis/team/${id}/events/near`, 60_000).catch((error) => {
        if (error instanceof RapidError && (error.status === 404 || error.status === 204)) return null;
        throw error;
      });
      res.json(entityPayload("team", id, teamProfile, teamNear));
      return;
    }
    if (profileResult.status === "rejected") throw profileResult.reason;

    res.json(
      entityPayload(
        type,
        id,
        profileResult.value,
        nearResult.status === "fulfilled" ? nearResult.value : null,
      ),
    );
  } catch (error) {
    next(error);
  }
});

function entityPayload(type, id, profile, near) {
  const person = profile?.player || profile?.team || profile || {};
  const team = person.team || profile?.team || person;
  return {
    type,
    id,
    name: person.name || team.name || "Jugador",
    country: person.country?.alpha2 || team.country?.alpha2 || null,
    events: extractEvents(near),
  };
}

function numericId(value) {
  return /^\d+$/.test(String(value || "")) ? String(value) : null;
}

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((error, _req, res, _next) => {
  const status = error instanceof RapidError || error instanceof ClaudeError ? error.status : error.status || 500;
  const httpStatus = [400, 402, 404, 429, 503].includes(status) ? status : 502;
  res.status(httpStatus).json({ error: error.message || "Error inesperado." });
});

if (fs.existsSync(path.join(WEB_DIST, "index.html"))) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: 0, etag: true }));
  app.get(/^\/(?!api|health).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Cancha API en http://127.0.0.1:${PORT}`);
  console.log(RAPIDAPI_KEY ? "RapidAPI configurado." : "RAPIDAPI_KEY ausente.");
});
