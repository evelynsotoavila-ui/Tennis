import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const promptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../PROMPBOT.md");

export const DEFAULT_RULES = {
  baseSinCuota: 50,
  probabilidadMin: 5,
  probabilidadMax: 95,
  alejamiento: 12,
  alejamientoAmplio: 18,
  fuentesParaAmpliar: 3,
  ajusteMinimo: 0.5,
  ranking: { divisor: 25, tope: 8 },
  h2h: { minimoPartidos: 2, factor: 8, tope: 6 },
  forma: { minimoPartidos: 2, factor: 8, tope: 6 },
  marcador: { porSet: 8, topeSets: 16, porJuego: 1.2, topeJuegos: 6 },
  sets: { dosCero: 68, dosUno: 54, unoDos: 46, ceroDos: 32 },
};

function readPrompt() {
  try {
    return fs.readFileSync(promptPath, "utf8");
  } catch {
    return "";
  }
}

function mergeRules(parsed) {
  const rules = { ...DEFAULT_RULES, ...parsed };
  for (const key of ["ranking", "h2h", "forma", "marcador", "sets"]) {
    rules[key] = { ...DEFAULT_RULES[key], ...(parsed?.[key] || {}) };
  }
  return rules;
}

export function loadRules(text = readPrompt()) {
  const match = String(text || "").match(/```reglas\s*([\s\S]*?)```/);
  if (!match) return { ...DEFAULT_RULES, ranking: { ...DEFAULT_RULES.ranking }, h2h: { ...DEFAULT_RULES.h2h }, forma: { ...DEFAULT_RULES.forma }, marcador: { ...DEFAULT_RULES.marcador }, sets: { ...DEFAULT_RULES.sets } };
  try {
    return mergeRules(JSON.parse(match[1]));
  } catch {
    return mergeRules({});
  }
}

const SYSTEM = `Eres el analista de tenis de Cancha. Recibes solo hechos ya reunidos de TennisApi y una probabilidad implícita del mercado, si existe.
Responde únicamente con un objeto JSON, sin markdown.
No inventes rankings, lesiones, rachas ni marcadores que no estén en los datos.
Si el partido ya terminó, kind es "recap": describe el resultado real y no pronostiques un ganador distinto.
Si sigue en juego o no ha empezado, kind es "forecast". La probabilidad del mercado es el punto de partida. Muévela solo cuando ranking, superficie, cara a cara o forma reciente lo justifiquen, y explica el ajuste.
homeProbability y awayProbability son enteros de 0 a 100 y suman 100.
confidence es "baja" si faltan cuota, ranking o partidos recientes; "media" con dos de esas fuentes; "alta" solo si hay cuota, ranking y al menos un historial.
projectedScore es un marcador orientativo en sets, por ejemplo "2-1", o null en un recap.
summary tiene como máximo dos frases, en español.
factors y risks son listas cortas en español, como máximo 4 y 3 elementos.`;

export function marketPrior(markets) {
  if (!Array.isArray(markets) || markets.length === 0) return null;
  const winner =
    markets.find((market) => /full time|winner|ganador|match|1x2|moneyline/i.test(market.name || "")) ||
    markets[0];
  const home = winner.choices?.find((choice) => choice.name === "1");
  const away = winner.choices?.find((choice) => choice.name === "2");
  if (!home?.decimal || !away?.decimal || home.decimal <= 1 || away.decimal <= 1) return null;
  const homeImplied = 1 / home.decimal;
  const awayImplied = 1 / away.decimal;
  const sum = homeImplied + awayImplied;
  return {
    market: winner.name,
    home: round1((100 * homeImplied) / sum),
    away: round1((100 * awayImplied) / sum),
    overround: round1(100 * (sum - 1)),
    live: Boolean(winner.isLive),
  };
}

export function buildBrief(bundle, form) {
  const { match, odds, statistics, h2h } = bundle;
  const allPeriod = (statistics || []).find((period) => period.period === "ALL") || statistics?.[0];
  const stats = [];
  for (const group of allPeriod?.groups || []) {
    for (const item of group.items || []) {
      if (!/ace|fault|serve|break|return|winner|unforced|punto|resto|doble/i.test(item.name || "")) continue;
      stats.push({ name: item.name, home: item.home, away: item.away });
      if (stats.length >= 8) break;
    }
    if (stats.length >= 8) break;
  }

  return {
    match: {
      status: match.status?.type,
      statusText: match.status?.description || "",
      tournament: match.tournament?.name,
      category: match.tournament?.category,
      round: match.tournament?.round,
      surface: match.tournament?.surface,
      home: playerBrief(match.home),
      away: playerBrief(match.away),
      homeSets: (match.homeSets || []).map((set) => set.games),
      awaySets: (match.awaySets || []).map((set) => set.games),
      homePoints: match.homePoints,
      awayPoints: match.awayPoints,
      winner: match.winnerCode === 1 ? "home" : match.winnerCode === 2 ? "away" : null,
    },
    market: marketPrior(odds?.markets || []),
    h2h: {
      homeWins: h2h?.homeWins ?? null,
      awayWins: h2h?.awayWins ?? null,
      recent: (h2h?.recent || []).slice(0, 5).map(compactMatch),
    },
    form: {
      home: (form?.home || []).slice(0, 5),
      away: (form?.away || []).slice(0, 5),
    },
    stats,
  };
}

function playerBrief(player) {
  return {
    name: player?.name || "Por definir",
    country: player?.country || null,
    ranking: player?.ranking ?? null,
  };
}

export function compactMatch(match) {
  return {
    tournament: match.tournament?.name || null,
    surface: match.tournament?.surface || null,
    home: match.home?.name,
    away: match.away?.name,
    homeSets: (match.homeSets || []).map((set) => set.games),
    awaySets: (match.awaySets || []).map((set) => set.games),
    winner: match.winnerCode === 1 ? "home" : match.winnerCode === 2 ? "away" : null,
  };
}

export function formLine(match, playerId) {
  const isHome = match.home?.id === playerId;
  const won =
    match.winnerCode === 1 ? isHome : match.winnerCode === 2 ? !isHome : null;
  return {
    opponent: isHome ? match.away?.name : match.home?.name,
    won,
    surface: match.tournament?.surface || null,
    tournament: match.tournament?.name || null,
    sets: isHome
      ? `${(match.homeSets || []).map((set) => set.games).join("-")} / ${(match.awaySets || []).map((set) => set.games).join("-")}`
      : `${(match.awaySets || []).map((set) => set.games).join("-")} / ${(match.homeSets || []).map((set) => set.games).join("-")}`,
  };
}

export function forecastPrompt(brief) {
  return `Datos del partido, en JSON:\n${JSON.stringify(brief)}\n\nDevuelve el objeto con las claves kind, pick, homeProbability, awayProbability, confidence, projectedScore, summary, factors, risks, adjustment.`;
}

export function parseModelJson(text) {
  const source = String(text || "");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : source;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Claude no devolvió un pronóstico legible.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export function calibrate(model, prior, status) {
  const finished = status === "finished";
  const summary = clip(model?.summary, 420);
  const factors = listOf(model?.factors, 4);
  const risks = listOf(model?.risks, 3);
  const adjustment = clip(model?.adjustment, 240);
  const projectedScore = finished ? null : clip(model?.projectedScore, 40);

  if (finished) {
    return {
      kind: "recap",
      pick: null,
      homeProbability: null,
      awayProbability: null,
      marketHome: prior?.home ?? null,
      marketAway: prior?.away ?? null,
      confidence: "alta",
      projectedScore: null,
      summary,
      factors,
      risks,
      adjustment,
    };
  }

  let home = Number(model?.homeProbability);
  let away = Number(model?.awayProbability);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0 || home + away <= 0) {
    home = prior?.home ?? 50;
    away = prior?.away ?? 50;
  }
  const sum = home + away;
  home = (100 * home) / sum;
  const rules = loadRules();
  if (prior) {
    const cap = model?.confidence === "alta" ? rules.alejamientoAmplio : rules.alejamiento;
    const delta = Math.max(-cap, Math.min(cap, home - prior.home));
    home = prior.home + delta;
  }
  home = Math.max(rules.probabilidadMin, Math.min(rules.probabilidadMax, home));
  away = 100 - home;
  const homeProbability = round1(home);
  const awayProbability = round1(away);
  return {
    kind: "forecast",
    pick: homeProbability === awayProbability ? null : homeProbability > awayProbability ? "home" : "away",
    homeProbability,
    awayProbability,
    marketHome: prior?.home ?? null,
    marketAway: prior?.away ?? null,
    confidence: ["baja", "media", "alta"].includes(model?.confidence) ? model.confidence : "baja",
    projectedScore,
    summary,
    factors,
    risks,
    adjustment,
  };
}

export function systemPrompt() {
  const text = readPrompt().trim();
  return text || SYSTEM;
}

export function localForecast(brief) {
  const rules = loadRules();
  const match = brief?.match || {};
  const market = brief?.market || null;
  const homeName = match.home?.name || "Local";
  const awayName = match.away?.name || "Visita";

  if (match.status === "finished") {
    const winnerName = match.winner === "home" ? homeName : match.winner === "away" ? awayName : null;
    const score = `${(match.homeSets || []).join(" ")} — ${(match.awaySets || []).join(" ")}`.trim();
    const resultado = winnerName ? `${winnerName} ${score}`.trim() : score;
    return {
      kind: "recap",
      pick: match.winner || null,
      homeProbability: null,
      awayProbability: null,
      marketHome: market?.home ?? null,
      marketAway: market?.away ?? null,
      confidence: "alta",
      projectedScore: null,
      resultado,
      summary: winnerName ? `${winnerName} cerró el partido ${score}.` : `El partido terminó ${score}.`,
      factors: ["Marcador publicado por TennisApi."],
      risks: [],
      adjustment: "Resultado final leído de TennisApi, con las reglas de PROMPBOT.",
      source: "local",
      model: "cancha-local",
    };
  }

  let home = market?.home ?? rules.baseSinCuota;
  const base = home;
  const factors = [];
  const risks = [];
  let sources = 0;

  if (market) {
    sources += 1;
    factors.push(`La cuota deja a ${homeName} en ${market.home}% y a ${awayName} en ${market.away}%.`);
  } else {
    risks.push("No hay cuota publicada, así que la base es 50/50.");
  }

  const shifts = [
    rankingShift(match, rules),
    h2hShift(brief?.h2h, homeName, awayName, rules),
    formShift(brief?.form, homeName, awayName, rules),
  ];
  if (match.status === "inprogress" && !market?.live) {
    shifts.push(scoreShift(match, homeName, awayName, rules));
  }
  if (market?.live) factors.push("La cuota ya es en vivo e incluye el marcador.");

  for (const shift of shifts) {
    if (!shift) continue;
    sources += shift.counts ? 1 : 0;
    home += shift.points;
    factors.push(shift.text);
  }

  if (market) {
    const cap = sources >= rules.fuentesParaAmpliar || match.status === "inprogress" ? rules.alejamientoAmplio : rules.alejamiento;
    home = base + Math.max(-cap, Math.min(cap, home - base));
  }
  home = Math.max(rules.probabilidadMin, Math.min(rules.probabilidadMax, home));
  const homeProbability = round1(home);
  const awayProbability = round1(100 - home);
  const pick = homeProbability === awayProbability ? null : homeProbability > awayProbability ? "home" : "away";
  const favorite = pick === "away" ? awayName : homeName;
  const percent = pick === "away" ? awayProbability : homeProbability;
  const projectedScore = projectSets(homeProbability, rules);

  return {
    kind: "forecast",
    pick,
    homeProbability,
    awayProbability,
    marketHome: market?.home ?? null,
    marketAway: market?.away ?? null,
    confidence: sources >= rules.fuentesParaAmpliar ? "alta" : sources === 2 ? "media" : "baja",
    projectedScore,
    resultado: `${favorite} ${projectedScore} (${percent}%)`,
    summary: `${favorite} queda con ${percent}% en el resultado final.`,
    factors: factors.slice(0, 4),
    risks: risks.slice(0, 3),
    adjustment: `Reglas de PROMPBOT: la cuota es la base y el ajuste máximo es ${rules.alejamiento} puntos, o ${rules.alejamientoAmplio} si hay varias fuentes.`,
    source: "local",
    model: "cancha-local",
  };
}

function rankingShift(match, rules) {
  const homeRank = Number(match.home?.ranking);
  const awayRank = Number(match.away?.ranking);
  if (!homeRank || !awayRank) return null;
  const points = clamp((awayRank - homeRank) / rules.ranking.divisor, -rules.ranking.tope, rules.ranking.tope);
  if (Math.abs(points) < rules.ajusteMinimo) return null;
  const better = points > 0 ? match.home.name : match.away.name;
  return {
    points: round1(points),
    counts: true,
    text: `El ranking favorece a ${better} (${homeRank} contra ${awayRank}).`,
  };
}

function h2hShift(h2h, homeName, awayName, rules) {
  const homeWins = Number(h2h?.homeWins);
  const awayWins = Number(h2h?.awayWins);
  if (!Number.isFinite(homeWins) || !Number.isFinite(awayWins)) return null;
  const total = homeWins + awayWins;
  if (total < rules.h2h.minimoPartidos) return null;
  const points = clamp(((homeWins - awayWins) / total) * rules.h2h.factor, -rules.h2h.tope, rules.h2h.tope);
  if (Math.abs(points) < rules.ajusteMinimo) return null;
  const leader = points > 0 ? homeName : awayName;
  return {
    points: round1(points),
    counts: true,
    text: `El cara a cara favorece a ${leader} (${homeWins}-${awayWins}).`,
  };
}

function formShift(form, homeName, awayName, rules) {
  const homeRate = winRate(form?.home, rules);
  const awayRate = winRate(form?.away, rules);
  if (homeRate == null || awayRate == null) return null;
  const points = clamp((homeRate - awayRate) * rules.forma.factor, -rules.forma.tope, rules.forma.tope);
  if (Math.abs(points) < rules.ajusteMinimo) return null;
  const better = points > 0 ? homeName : awayName;
  return {
    points: round1(points),
    counts: true,
    text: `La forma reciente favorece a ${better}.`,
  };
}

function scoreShift(match, homeName, awayName, rules) {
  const homeSets = match.homeSets || [];
  const awaySets = match.awaySets || [];
  const count = Math.max(homeSets.length, awaySets.length);
  if (!count) return null;
  let homeWon = 0;
  let awayWon = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === count - 1) continue;
    const homeGames = homeSets[index] ?? 0;
    const awayGames = awaySets[index] ?? 0;
    if (homeGames > awayGames) homeWon += 1;
    else if (awayGames > homeGames) awayWon += 1;
  }
  const lastHome = homeSets.at(-1) ?? 0;
  const lastAway = awaySets.at(-1) ?? 0;
  const points =
    clamp((homeWon - awayWon) * rules.marcador.porSet, -rules.marcador.topeSets, rules.marcador.topeSets) +
    clamp((lastHome - lastAway) * rules.marcador.porJuego, -rules.marcador.topeJuegos, rules.marcador.topeJuegos);
  if (Math.abs(points) < rules.ajusteMinimo) return null;
  const leader = points > 0 ? homeName : awayName;
  return {
    points: round1(points),
    counts: false,
    text: `El marcador en juego favorece a ${leader}.`,
  };
}

function winRate(rows, rules) {
  const decided = (rows || []).filter((row) => row.won === true || row.won === false);
  if (decided.length < rules.forma.minimoPartidos) return null;
  return decided.filter((row) => row.won).length / decided.length;
}

function projectSets(home, rules) {
  if (home >= rules.sets.dosCero) return "2-0";
  if (home >= rules.sets.dosUno) return "2-1";
  if (home <= rules.sets.ceroDos) return "0-2";
  if (home <= rules.sets.unoDos) return "1-2";
  return home >= 50 ? "2-1" : "1-2";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clip(value, max) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function listOf(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, max)
    .map((item) => clip(item, 160));
}
