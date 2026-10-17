<script>
  import { getJson } from "../lib/api.js";
  import { flag } from "../lib/format.js";

  let { onopen } = $props();

  const tours = [
    { id: "atp", label: "ATP" },
    { id: "wta", label: "WTA" },
    { id: "atp-live", label: "ATP live" },
    { id: "wta-live", label: "WTA live" },
  ];

  let tour = $state("atp");
  let rows = $state([]);
  let loading = $state(true);
  let error = $state("");

  $effect(() => {
    const selected = tour;
    let ignore = false;
    loading = true;
    error = "";
    getJson(`/api/rankings/${selected}`)
      .then((data) => {
        if (!ignore) rows = data.rankings || [];
      })
      .catch((reason) => {
        if (!ignore) {
          rows = [];
          error = reason.message;
        }
      })
      .finally(() => {
        if (!ignore) loading = false;
      });
    return () => {
      ignore = true;
    };
  });

  function movement(row) {
    if (row.previousRank == null) return "";
    const delta = row.previousRank - row.rank;
    if (delta > 0) return `+${delta}`;
    if (delta < 0) return `${delta}`;
    return "=";
  }
</script>

<section class="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
  <p class="text-[11px] uppercase tracking-[0.22em] text-clay">Rankings</p>
  <h2 class="font-display text-4xl sm:text-5xl">La tabla</h2>
  <div class="mt-4 flex flex-wrap gap-2">
    {#each tours as item}
      <button
        class="rounded-full px-3 py-1.5 text-sm {tour === item.id ? 'bg-ball text-ink' : 'bg-court text-muted'}"
        onclick={() => (tour = item.id)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  {#if error}
    <p class="mt-6 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm">{error}</p>
  {:else if loading}
    <div class="mt-6">
      <div class="h-72 animate-pulse rounded-3xl bg-court"></div>
      <p class="mt-3 text-sm text-muted">Cargando la tabla…</p>
    </div>
  {:else if rows.length === 0}
    <p class="mt-6 text-sm text-muted">Este ranking no tiene filas publicadas ahora.</p>
  {:else}
    <ol class="mt-6 overflow-hidden rounded-3xl border border-line/10 bg-court/80">
      {#each rows as row (row.rank + row.player.name)}
        <li class="border-b border-line/10 last:border-b-0">
          <button
            class="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-line/5 disabled:cursor-default sm:px-5"
            disabled={!row.player.id}
            onclick={() => row.player.id && onopen(row.player.id)}
          >
            <span class="font-display text-2xl tabular-nums text-muted">{row.rank}</span>
            <span class="min-w-0">
              <span class="block truncate">{flag(row.player.country)} {row.player.name}</span>
              <span class="text-xs {movement(row).startsWith('+') ? 'text-ball' : movement(row).startsWith('-') ? 'text-clay' : 'text-muted'}">
                {movement(row) || "sin cambio"}
              </span>
            </span>
            <span class="text-sm tabular-nums text-muted">{row.points ?? "—"} pts</span>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</section>
