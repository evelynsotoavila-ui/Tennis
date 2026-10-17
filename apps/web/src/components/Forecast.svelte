<script>
  import { getJson } from "../lib/api.js";

  let { matchId, homeName, awayName } = $props();

  let forecast = $state(null);
  let loading = $state(true);
  let error = $state("");

  $effect(() => {
    const id = matchId;
    let ignore = false;
    loading = true;
    error = "";
    forecast = null;
    getJson(`/api/matches/${id}/forecast`)
      .then((data) => {
        if (!ignore) forecast = data;
      })
      .catch((reason) => {
        if (!ignore) error = reason.message;
      })
      .finally(() => {
        if (!ignore) loading = false;
      });
    return () => {
      ignore = true;
    };
  });

  const homeWidth = $derived(forecast?.homeProbability ?? 50);
</script>

<section class="mt-8">
  <div class="mb-3 flex items-end justify-between gap-3">
    <h3 class="font-display text-3xl">{forecast?.kind === "recap" ? "Lectura" : "Pronóstico"}</h3>
    <p class="text-right text-[11px] uppercase tracking-[0.16em] text-muted">{forecast?.source === "local" ? "Local" : "Claude"}</p>
  </div>

  {#if loading}
    <div class="h-36 animate-pulse rounded-3xl bg-court"></div>
  {:else if error}
    <p class="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm">{error}</p>
  {:else if forecast}
    <article class="rounded-3xl border border-line/10 bg-court p-4 sm:p-5">
      {#if forecast.kind === "forecast"}
        <p class="text-[11px] uppercase tracking-[0.16em] text-clay">
          {forecast.pick === "home" ? homeName : forecast.pick === "away" ? awayName : "Sin favorito claro"}
          · confianza {forecast.confidence}
        </p>
        <div class="mt-4 space-y-2">
          <div class="flex justify-between text-sm">
            <span>{homeName}</span>
            <span class="tabular-nums">{forecast.homeProbability}%</span>
          </div>
          <div class="flex h-2 overflow-hidden rounded-full bg-ink">
            <span class="bg-ball" style="width: {homeWidth}%"></span>
            <span class="bg-clay" style="width: {100 - homeWidth}%"></span>
          </div>
          <div class="flex justify-between text-sm">
            <span>{awayName}</span>
            <span class="tabular-nums">{forecast.awayProbability}%</span>
          </div>
        </div>
        {#if forecast.marketHome != null}
          <p class="mt-3 text-xs text-muted">
            La cuota implicaba {forecast.marketHome}% / {forecast.marketAway}%. El modelo se mueve poco si no hay evidencia extra.
          </p>
        {/if}
        {#if forecast.resultado}
          <p class="mt-4 font-display text-2xl">Resultado final: {forecast.resultado}</p>
        {/if}
        {#if forecast.projectedScore}
          <p class="mt-3 text-sm">Marcador orientativo: {forecast.projectedScore}</p>
        {/if}
      {:else}
        <p class="text-[11px] uppercase tracking-[0.16em] text-muted">
          {forecast.source === "local" ? "Resultado real, leído en el servidor" : "Resultado real, leído por Claude"}
        </p>
        {#if forecast.resultado}
          <p class="mt-3 font-display text-2xl">{forecast.resultado}</p>
        {/if}
      {/if}

      {#if forecast.summary}
        <p class="mt-4 text-sm leading-6">{forecast.summary}</p>
      {/if}
      {#if forecast.factors?.length}
        <ul class="mt-4 space-y-1 text-sm text-line">
          {#each forecast.factors as factor}
            <li>{factor}</li>
          {/each}
        </ul>
      {/if}
      {#if forecast.risks?.length}
        <ul class="mt-3 space-y-1 text-sm text-muted">
          {#each forecast.risks as risk}
            <li>{risk}</li>
          {/each}
        </ul>
      {/if}
      <p class="mt-4 text-xs text-muted">
        Estimación a partir de datos de TennisApi. No es una apuesta ni un resultado garantizado.
      </p>
    </article>
  {/if}
</section>
