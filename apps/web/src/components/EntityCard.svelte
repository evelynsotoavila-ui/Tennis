<script>
  import MatchRow from "./MatchRow.svelte";
  import { getJson } from "../lib/api.js";
  import { flag } from "../lib/format.js";

  let { type, id, onopen, onback } = $props();

  let entity = $state(null);
  let loading = $state(true);
  let error = $state("");

  $effect(() => {
    const entityType = type;
    const entityId = id;
    let ignore = false;
    loading = true;
    error = "";
    entity = null;
    getJson(`/api/entity/${entityType}/${entityId}`)
      .then((data) => {
        if (!ignore) entity = data;
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
</script>

<section class="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6">
  <button class="mb-6 text-sm text-muted hover:text-line" onclick={onback}>← Volver</button>
  {#if loading}
    <div class="h-48 animate-pulse rounded-3xl bg-court"></div>
  {:else if error}
    <p class="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm">{error}</p>
  {:else if entity}
    <p class="text-[11px] uppercase tracking-[0.2em] text-clay">{flag(entity.country)} Ficha</p>
    <h2 class="font-display text-5xl">{entity.name}</h2>
    <h3 class="mt-8 font-display text-3xl">Partidos cercanos</h3>
    {#if entity.events?.length}
      <div class="mt-4 overflow-hidden rounded-3xl border border-line/10 bg-court/80">
        {#each entity.events as match (match.id)}
          <MatchRow {match} {onopen} />
        {/each}
      </div>
    {:else}
      <p class="mt-3 text-sm text-muted">No hay partidos cercanos publicados para esta ficha.</p>
    {/if}
  {/if}
</section>
