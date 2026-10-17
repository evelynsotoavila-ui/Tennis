const SURFACE = [
  [/clay|tierra|arcilla/i, "Tierra batida"],
  [/grass|hierba|césped|cesped/i, "Hierba"],
  [/hard|dura|cemento/i, "Dura"],
  [/carpet|moqueta|indoor carpet/i, "Moqueta"],
];

export function fractionalToDecimal(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text || text === "-") return null;
  if (text.includes("/")) {
    const [left, right] = text.split("/").map((part) => Number(part));
    if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return null;
    return 1 + left / right;
  }
  const asNumber = Number(text.replace(",", "."));
  return Number.isFinite(asNumber) ? asNumber : null;
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/,\s*$/, "")
    .trim();
}

function translateRound(name) {
  if (!name) return null;
  const labels = {
    final: "Final",
    semifinal: "Semifinal",
    semifinals: "Semifinales",
    quarterfinal: "Cuartos",
    quarterfinals: "Cuartos de final",
    "round of 16": "Octavos",
    "round of 32": "Dieciseisavos",
    "round of 64": "Ronda de 64",
    "round of 128": "Ronda de 128",
  };
  return labels[String(name).toLowerCase()] || name;
}

export function translateSurface(value) {
  if (!value) return null;
  const text = String(value);
  for (const [pattern, label] of SURFACE) {
    if (pattern.test(text)) return label;
  }
  return text;
}

function teamOf(team) {
  if (!team) {
    return { id: null, name: "Por definir", shortName: "Por definir", country: null, ranking: null };
  }
  return {
    id: team.id ?? null,
    name: team.name || team.shortName || "Por definir",
    shortName: team.shortName || team.name || "Por definir",
    country: team.country?.alpha2 || team.country?.name || null,
    ranking: team.ranking ?? null,
  };
}

function setsOf(score) {
  if (!score || typeof score !== "object") return [];
  const sets = [];
  for (let period = 1; period <= 5; period += 1) {
    const games = score[`period${period}`];
    if (games == null) continue;
    sets.push({
      games,
      tiebreak: score[`period${period}TieBreak`] ?? null,
    });
  }
  return sets;
}

export function toMatch(event) {
  if (!event || typeof event !== "object") return null;
  const source = event.event && (event.event.homeTeam || event.event.id) ? event.event : event;
  if (!source.id && !source.homeTeam && !source.awayTeam) return null;

  const tournament = source.tournament || {};
  const category = tournament.category || source.category || {};
  const status = source.status || {};

  return {
    id: source.id ?? null,
    customId: source.customId || source.customID || null,
    slug: source.slug || null,
    startTimestamp: source.startTimestamp ?? source.startTime ?? null,
    status: {
      type: String(status.type || "unknown").toLowerCase(),
      description: status.description || "",
      code: status.code ?? null,
    },
    tournament: {
      id: tournament.uniqueTournament?.id || tournament.id || null,
      name: cleanLabel(tournament.uniqueTournament?.name || tournament.name || "Torneo"),
      category: category.name ? cleanLabel(category.name) : null,
      categoryId: category.id ?? null,
      round: translateRound(source.roundInfo?.name),
      surface: translateSurface(
        source.groundType || tournament.uniqueTournament?.groundType || tournament.groundType,
      ),
    },
    home: teamOf(source.homeTeam || source.home),
    away: teamOf(source.awayTeam || source.away),
    homeSets: setsOf(source.homeScore),
    awaySets: setsOf(source.awayScore),
    homePoints: source.homeScore?.point ?? null,
    awayPoints: source.awayScore?.point ?? null,
    winnerCode: source.winnerCode ?? null,
  };
}

function looksLikeEvent(value) {
  return Boolean(value && typeof value === "object" && (value.homeTeam || value.awayTeam || value.event));
}

export function extractEvents(payload) {
  const found = [];
  const visit = (value, depth) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      if (value.some(looksLikeEvent)) {
        for (const item of value) {
          if (looksLikeEvent(item)) found.push(item);
        }
        return;
      }
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    if (looksLikeEvent(value) && (value.homeTeam || value.event)) found.push(value);
    for (const key of ["events", "matches", "scheduledEvents", "results", "tournaments", "sport"]) {
      if (value[key]) visit(value[key], depth + 1);
    }
  };
  visit(payload, 0);

  const seen = new Set();
  const events = [];
  for (const item of found) {
    const match = toMatch(item);
    if (!match?.id || seen.has(match.id)) continue;
    seen.add(match.id);
    events.push(match);
  }
  events.sort((a, b) => (a.startTimestamp || 0) - (b.startTimestamp || 0));
  return events;
}

export function extractOddsPreview(payload) {
  const previews = new Map();
  if (!payload || typeof payload !== "object" || Array.isArray(payload.odds)) return previews;
  const odds = payload.odds;
  if (!odds || typeof odds !== "object") return previews;

  for (const [eventId, value] of Object.entries(odds)) {
    const markets = extractMarkets(Array.isArray(value) ? { markets: value } : value);
    const winner = markets.find((market) => isWinnerMarket(market.name)) || markets[0];
    if (!winner) continue;
    previews.set(String(eventId), {
      market: winner.name,
      choices: winner.choices.slice(0, 2).map((choice) => choice.decimal),
    });
  }
  return previews;
}

function isWinnerMarket(name) {
  return /winner|ganador|full time|match|1x2|moneyline|to win/i.test(name || "");
}

export function extractMarkets(payload) {
  if (!payload) return [];
  let markets = [];
  if (Array.isArray(payload)) markets = payload;
  else if (Array.isArray(payload.markets)) markets = payload.markets;
  else if (Array.isArray(payload.odds)) markets = payload.odds;
  else if (payload.odds && typeof payload.odds === "object") markets = Object.values(payload.odds);
  else if (payload.marketName || payload.choices) markets = [payload];

  return markets
    .flatMap((market) => (Array.isArray(market) ? market : [market]))
    .filter((market) => market && typeof market === "object")
    .map((market) => ({
      id: market.marketId ?? market.id ?? null,
      name: market.marketName || market.name || "Mercado",
      isLive: Boolean(market.isLive),
      suspended: Boolean(market.suspend || market.suspended),
      choices: (market.choices || [])
        .map((choice) => ({
          name: choice.name || choice.choiceName || "—",
          decimal: choice.decimalValue ?? fractionalToDecimal(choice.fractionalValue),
          fractional: choice.fractionalValue || null,
          change: Number(choice.change || 0),
          winning: Boolean(choice.winning),
        }))
        .filter((choice) => choice.decimal != null || choice.name),
    }))
    .filter((market) => market.choices.length > 0);
}

export function extractRankings(payload) {
  const rows = payload?.rankings || payload?.ranking || payload?.rows || [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const team = row.team || row.player || {};
    return {
      rank: row.ranking ?? row.rank ?? row.position ?? index + 1,
      points: row.points ?? null,
      previousRank: row.previousRanking ?? row.previousRank ?? null,
      bestRank: row.bestRanking ?? null,
      player: {
        id: team.id ?? row.teamId ?? row.rowId ?? null,
        name: team.name || row.rowName || row.name || "Jugador",
        shortName: team.shortName || team.name || row.rowName || "Jugador",
        country: team.country?.alpha2 || row.country?.alpha2 || null,
      },
    };
  });
}

export function extractSearch(payload) {
  const items = [];
  const push = (type, entity) => {
    if (!entity || typeof entity !== "object" || !entity.name) return;
    items.push({
      type: type === "players" ? "player" : type === "teams" ? "team" : type || "team",
      id: entity.id ?? null,
      name: entity.name,
      country: entity.country?.alpha2 || entity.country?.name || null,
      subtitle: entity.category?.name || entity.sport?.name || null,
    });
  };

  if (Array.isArray(payload?.results)) {
    for (const result of payload.results) push(result.type || "team", result.entity || result);
  }
  for (const key of ["teams", "players", "tournaments", "uniqueTournaments"]) {
    if (Array.isArray(payload?.[key])) {
      for (const entity of payload[key]) push(key.replace(/s$/, ""), entity);
    }
  }

  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractStatistics(payload) {
  const periods = payload?.statistics || payload?.periods || [];
  if (!Array.isArray(periods)) return [];
  return periods.map((period) => ({
    period: period.period || period.name || "ALL",
    groups: (period.groups || []).map((group) => ({
      name: group.groupName || group.name || "Estadísticas",
      items: (group.statisticsItems || group.items || []).map((item) => ({
        name: item.name,
        home: item.home ?? item.homeValue ?? null,
        away: item.away ?? item.awayValue ?? null,
        homeValue: numberOrNull(item.homeValue ?? item.home),
        awayValue: numberOrNull(item.awayValue ?? item.away),
      })),
    })),
  }));
}

function numberOrNull(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.replace("%", "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function extractH2H(payload) {
  if (!payload || typeof payload !== "object") {
    return { homeWins: null, awayWins: null, draws: null, recent: [] };
  }
  const duel = payload.teamDuel || payload.duel || {};
  return {
    homeWins: duel.homeWins ?? null,
    awayWins: duel.awayWins ?? null,
    draws: duel.draws ?? null,
    recent: extractEvents(payload.events || payload).slice(0, 8),
  };
}

export function extractCategories(payload) {
  const found = [];
  const lists = [payload?.categories, payload?.dailyCategories, Array.isArray(payload) ? payload : null];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const category = item?.category?.id ? item.category : item;
      if (!category?.id || !(category.name || category.slug)) continue;
      found.push({
        id: category.id,
        name: category.name || category.slug,
        slug: category.slug || "",
      });
    }
  }

  const seen = new Set();
  const categories = found.filter((category) => {
    if (seen.has(category.id)) return false;
    seen.add(category.id);
    return true;
  });

  const priority = (name) => {
    const text = name.toLowerCase();
    if (text.includes("atp")) return 0;
    if (text.includes("wta")) return 1;
    if (text.includes("challenger")) return 2;
    if (text.includes("itf")) return 3;
    return 4;
  };
  categories.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
  return categories;
}

export function splitDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function attachPreviews(matches, previews) {
  return matches.map((match) => ({
    ...match,
    oddsPreview: previews.get(String(match.id)) || null,
  }));
}
