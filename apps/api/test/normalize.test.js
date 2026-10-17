import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCategories,
  extractEvents,
  extractMarkets,
  extractOddsPreview,
  extractRankings,
  extractSearch,
  fractionalToDecimal,
  translateSurface,
} from "../src/normalize.js";

test("convierte cuotas fraccionarias a decimales", () => {
  assert.equal(fractionalToDecimal("4/6"), 1 + 4 / 6);
  assert.equal(fractionalToDecimal("1.85"), 1.85);
  assert.equal(fractionalToDecimal(null), null);
});

test("traduce la superficie", () => {
  assert.equal(translateSurface("Red clay"), "Tierra batida");
  assert.equal(translateSurface("Hardcourt outdoor"), "Dura");
  assert.equal(translateSurface("Grass"), "Hierba");
});

test("normaliza un evento de TennisApi", () => {
  const [match] = extractEvents({
    events: [
      {
        id: 14232981,
        customId: "AbCd",
        startTimestamp: 1760700000,
        status: { type: "inprogress", description: "2nd set" },
        groundType: "Clay",
        tournament: {
          name: "Paris",
          category: { id: 3, name: "ATP" },
          uniqueTournament: { name: "Rolex Paris Masters" },
        },
        roundInfo: { name: "Cuartos" },
        homeTeam: { id: 1, name: "Carlos Alcaraz", shortName: "Alcaraz C.", country: { alpha2: "ES" } },
        awayTeam: { id: 2, name: "Jannik Sinner", shortName: "Sinner J.", country: { alpha2: "IT" } },
        homeScore: { period1: 6, period2: 3, point: "30" },
        awayScore: { period1: 4, period2: 4, point: "40" },
      },
    ],
  });

  assert.equal(match.id, 14232981);
  assert.equal(match.tournament.name, "Rolex Paris Masters");
  assert.equal(match.tournament.surface, "Tierra batida");
  assert.equal(match.home.country, "ES");
  assert.deepEqual(match.homeSets, [
    { games: 6, tiebreak: null },
    { games: 3, tiebreak: null },
  ]);
  assert.equal(match.homePoints, "30");
});

test("toma la cuota suelta del feed diario", () => {
  const previews = extractOddsPreview({
    odds: {
      99: {
        marketName: "Full time",
        choices: [
          { name: "1", fractionalValue: "1/2" },
          { name: "2", fractionalValue: "2/1" },
        ],
      },
    },
  });
  assert.equal(previews.get("99").choices.length, 2);
  assert.equal(extractEvents({ odds: { 99: { marketName: "Full time", choices: [] } } }).length, 0);
});

test("normaliza mercados de getMatchBettingOdds", () => {
  const markets = extractMarkets({
    markets: [
      {
        marketId: 1,
        marketName: "Full time",
        isLive: false,
        choices: [
          { name: "1", fractionalValue: "4/6", change: -1 },
          { name: "2", fractionalValue: "6/4", change: 1 },
        ],
      },
    ],
  });
  assert.equal(markets.length, 1);
  assert.ok(markets[0].choices[0].decimal > 1);
  assert.equal(markets[0].choices[1].name, "2");
});

test("normaliza rankings y búsqueda", () => {
  const rankings = extractRankings({
    rankings: [{ ranking: 1, points: 11000, previousRanking: 2, team: { id: 9, name: "Iga Swiatek", country: { alpha2: "PL" } } }],
  });
  assert.equal(rankings[0].player.country, "PL");
  assert.equal(rankings[0].previousRank, 2);

  const results = extractSearch({
    results: [{ type: "team", entity: { id: 9, name: "Iga Swiatek", country: { alpha2: "PL" } } }],
  });
  assert.equal(results[0].name, "Iga Swiatek");
});

test("prioriza categorías ATP y WTA", () => {
  const categories = extractCategories({
    categories: [
      { category: { id: 8, name: "ITF Women" } },
      { category: { id: 3, name: "ATP" } },
      { category: { id: 6, name: "WTA" } },
    ],
  });
  assert.deepEqual(
    categories.map((category) => category.name),
    ["ATP", "WTA", "ITF Women"],
  );
});
