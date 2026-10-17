<script>
  import Forecast from "./Forecast.svelte";
  import { getJson } from "../lib/api.js";
  import { choiceLabel, clock, flag, longDate, oddsText, periodLabel, statusLabel } from "../lib/format.js";

  let { id, onback } = $props();

  let payload = $state(null);
  let loading = $state(true);
  let error = $state("");
  let period = $state("ALL");

  $effect(() => {
    const matchId = id;
    let ignore = false;
    loading = true;
    error = "";
    payload = null;
    getJson(`/api/matches/${matchId}`)
      .then((data) => {
        if (!ignore) payload = data;
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

  const match = $derived(payload?.match);
  const periods = $derived(payload?.statistics || []);
  const activePeriod = $derived(periods.find((item) => item.period === period) || periods[0]);
  const setCount = $derived(match ? Math.max(match.homeSets.length, match.awaySets.length) : 0);

  function bar(item) {
    const home = Number(item.homeValue);
    const away = Number(item.awayValue);
    if (!Number.isFinite(home) || !Number.isFinite(away) || home + away === 0) return [50, 50];
    const total = home + away;
    return [(home / total) * 100, (away / total) * 100];
  }
</script>

<section class="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
  <button class="mb-6 text-sm text-muted hover:text-line" onclick={() => onback()}>← Volver a la agenda</button>

  {#if loading}
    <div class="h-64 animate-pulse rounded-3xl bg-court"></div>
  {:else if error}
    <p class="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm">{error}</p>
  {:else if match}
    <p class="text-[11px] uppercase tracking-[0.2em] text-clay">
      {match.tournament.category || "Tenis"} · {match.tournament.name}
    </p>
    <h2 class="mt-2 font-display text-4xl sm:text-5xl">{statusLabel(match.status)}</h2>
    <p class="mt-1 text-sm text-muted">
      {longDate(match.startTimestamp) || clock(match.startTimestamp)}
      {#if match.tournament.round}· {match.tournament.round}{/if}
      {#if match.tournament.surface}· {match.tournament.surface}{/if}
    </p>

    <div class="mt-6 overflow-hidden rounded-3xl border border-line/10 bg-court">
      {#each [["home", match.home, match.homeSets, match.homePoints, 1], ["away", match.away, match.awaySets, match.awayPoints, 2]] as [_, player, sets, points, code]}
        <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line/10 px-4 py-4 last:border-b-0 sm:px-6">
          <div>
            <p class="text-xs text-muted">{flag(player.country) || player.country || ""}</p>
            <p class="font-display text-3xl leading-tight {match.winnerCode && match.winnerCode !== code ? 'text-muted' : ''}">
              {player.name}
            </p>
          </div>
          <div class="flex items-end gap-2 tabular-nums">
            {#each Array.from({ length: setCount }) as __, index}
              <span class="w-8 text-center font-display text-3xl">
                {sets[index]?.games ?? "·"}
                {#if sets[index]?.tiebreak != null}
                  <sup class="text-xs text-muted">{sets[index].tiebreak}</sup>
                {/if}
              </span>
            {/each}
            {#if match.status.type === "inprogress" && points}
              <span class="mb-1 min-w-8 text-center text-ball">{points}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <Forecast matchId={match.id} homeName={match.home.shortName} awayName={match.away.shortName} />

    <div class="mt-8">
      <div class="mb-3 flex items-end justify-between gap-3">
        <h3 class="font-display text-3xl">Cuotas</h3>
        <p class="text-right text-[11px] uppercase tracking-[0.16em] text-muted">
          Bookmaker 1<br />{payload.odds?.source === "getMatchBettingOdds" ? "getMatchBettingOdds" : "mercados del partido"}
        </p>
      </div>
      {#if payload.odds?.error}
        <p class="text-sm text-miss">{payload.odds.error}</p>
      {:else if payload.odds?.markets?.length}
        <div class="space-y-3">
          {#each payload.odds.markets as market}
            <article class="rounded-2xl border border-line/10 bg-panel/80 p-4">
              <div class="mb-3 flex items-center justify-between gap-3">
                <h4 class="text-sm uppercase tracking-[0.14em] text-muted">{market.name}</h4>
                {#if market.suspended}
                  <span class="text-[11px] uppercase tracking-[0.14em] text-clay">Suspendido</span>
                {:else if market.isLive}
                  <span class="text-[11px] uppercase tracking-[0.14em] text-ball">En vivo</span>
                {/if}
              </div>
              <div class="grid gap-2 sm:grid-cols-2">
                {#each market.choices as choice}
                  <div class="flex items-center justify-between rounded-xl bg-ink/50 px-3 py-3">
                    <span class="truncate pr-3 text-sm">{choiceLabel(choice, match)}</span>
                    <span class="flex items-center gap-2 font-display text-2xl tabular-nums">
                      {#if choice.change < 0}<span class="text-xs text-ball">↓</span>{/if}
                      {#if choice.change > 0}<span class="text-xs text-clay">↑</span>{/if}
                      {oddsText(choice.decimal)}
                    </span>
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="rounded-2xl border border-dashed border-line/20 px-4 py-6 text-sm text-muted">
          Este partido todavía no tiene cuotas publicadas.
        </p>
      {/if}
    </div>

    {#if periods.length}
      <div class="mt-10">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-display text-3xl">Estadísticas</h3>
          <div class="flex flex-wrap gap-2">
            {#each periods as item}
              <button
                class="rounded-full px-3 py-1 text-xs uppercase tracking-[0.12em] {(activePeriod?.period === item.period) ? 'bg-line text-ink' : 'bg-court text-muted'}"
                onclick={() => (period = item.period)}
              >
                {periodLabel(item.period)}
              </button>
            {/each}
          </div>
        </div>
        {#each activePeriod?.groups || [] as group}
          <h4 class="mb-2 mt-5 text-xs uppercase tracking-[0.16em] text-muted">{group.name}</h4>
          <div class="space-y-3">
            {#each group.items as item}
              {@const widths = bar(item)}
              <div>
                <div class="mb-1 flex justify-between text-sm tabular-nums">
                  <span>{item.home ?? "—"}</span>
                  <span class="text-muted">{item.name}</span>
                  <span>{item.away ?? "—"}</span>
                </div>
                <div class="flex h-1.5 overflow-hidden rounded-full bg-ink">
                  <span class="bg-ball" style="width: {widths[0]}%"></span>
                  <span class="bg-clay" style="width: {widths[1]}%"></span>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    {#if payload.h2h && (payload.h2h.homeWins != null || payload.h2h.recent?.length)}
      <div class="mt-10">
        <h3 class="font-display text-3xl">Cara a cara</h3>
        {#if payload.h2h.homeWins != null}
          <p class="mt-2 text-sm text-muted">
            {match.home.shortName} {payload.h2h.homeWins} — {payload.h2h.awayWins} {match.away.shortName}
          </p>
        {/if}
        <div class="mt-4 overflow-hidden rounded-3xl border border-line/10">
          {#each payload.h2h.recent as recent (recent.id)}
            <button class="block w-full border-b border-line/10 px-4 py-3 text-left last:border-b-0 hover:bg-line/5" onclick={() => onback(String(recent.id))}>
              <p class="text-xs text-muted">{recent.tournament.name} · {longDate(recent.startTimestamp)}</p>
              <p class="mt-1 text-sm">
                {recent.home.name}
                <span class="text-muted">
                  {recent.homeSets.map((set) => set.games).join(" ")} — {recent.awaySets.map((set) => set.games).join(" ")}
                </span>
                {recent.away.name}
              </p>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>
