import assert from "node:assert/strict";
import test from "node:test";
import { calibrate, loadRules, localForecast, marketPrior, parseModelJson } from "../src/forecast.js";

test("convierte la cuota en probabilidad implícita sin el margen", () => {
  const prior = marketPrior([
    {
      name: "Full time",
      choices: [
        { name: "1", decimal: 1.5 },
        { name: "2", decimal: 2.5 },
      ],
    },
  ]);
  assert.equal(prior.home + prior.away, 100);
  assert.ok(prior.home > prior.away);
  assert.ok(prior.overround > 0);
});

test("no deja que el modelo se aleje demasiado de la cuota", () => {
  const prior = { home: 60, away: 40 };
  const forecast = calibrate(
    {
      homeProbability: 92,
      awayProbability: 8,
      confidence: "media",
      summary: "El favorito llega mejor.",
      factors: ["Mejor ranking"],
      risks: ["Poca muestra"],
    },
    prior,
    "notstarted",
  );
  assert.equal(forecast.homeProbability, 72);
  assert.equal(forecast.awayProbability, 28);
  assert.equal(forecast.pick, "home");
});

test("un partido terminado no se vuelve a pronosticar", () => {
  const recap = calibrate(
    { summary: "Cerró en dos sets.", homeProbability: 80, awayProbability: 20 },
    { home: 55, away: 45 },
    "finished",
  );
  assert.equal(recap.kind, "recap");
  assert.equal(recap.homeProbability, null);
  assert.equal(recap.projectedScore, null);
});

test("el pronóstico local parte de la cuota y solo la corrige un poco", () => {
  const forecast = localForecast({
    match: {
      status: "notstarted",
      home: { name: "Jannik Sinner", ranking: 1 },
      away: { name: "Un debutante", ranking: 180 },
      homeSets: [],
      awaySets: [],
    },
    market: { home: 70, away: 30, live: false },
    h2h: { homeWins: 2, awayWins: 0 },
    form: {
      home: [{ won: true }, { won: true }],
      away: [{ won: false }, { won: false }],
    },
  });
  assert.equal(forecast.source, "local");
  assert.equal(forecast.pick, "home");
  assert.ok(forecast.homeProbability > 70);
  assert.ok(forecast.homeProbability <= 88);
  assert.equal(forecast.homeProbability + forecast.awayProbability, 100);
});

test("lee las reglas numéricas de PROMPBOT", () => {
  const rules = loadRules();
  assert.equal(rules.alejamiento, 12);
  assert.equal(rules.alejamientoAmplio, 18);
  assert.equal(rules.ranking.divisor, 25);
  assert.equal(rules.sets.dosCero, 68);
});

test("lee el JSON aunque venga entre texto", () => {
  const parsed = parseModelJson('Listo.\n{"homeProbability":61,"awayProbability":39}\nfin');
  assert.equal(parsed.homeProbability, 61);
});
