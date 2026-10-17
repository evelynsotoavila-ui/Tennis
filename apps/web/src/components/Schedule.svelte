<script>
  import MatchRow from "./MatchRow.svelte";
  import { categoryTone, dayLabel, shiftDate, todayIso } from "../lib/format.js";

  let {
    date,
    events = [],
    loading = false,
    error = "",
    source = "",
    notice = "",
    mode = "agenda",
    ondate,
    onopen,
    onrefresh,
  } = $props();

  let filter = $state("todos");

  const filters = [
    { id: "todos", label: "Todos" },
    { id: "atp", label: "ATP" },
    { id: "wta", label: "WTA" },
    { id: "challenger", label: "Challenger" },
    { id: "itf", label: "ITF" },
  ];

  const visible = $derived(
    events.filter((match) => {
      const category = `${match.tournament.category || ""} ${match.tournament.name || ""}`.toLowerCase();
      if (filter === "todos") return true;
      return category.includes(filter);
    }),
  );

  const groups = $derived.by(() => {
    const map = new Map();
    for (const match of visible) {
      const key = `${match.tournament.category || "Tenis"} · ${match.tournament.name}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          category: match.tournament.category,
          name: match.tournament.name,
          surface: match.tournament.surface,
          matches: [],
        });
      }
      map.get(key).matches.push(match);
    }
    return [...map.values()];
  });
</script>

<section class="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="text-[11px] uppercase tracking-[0.22em] text-clay">{mode === "live" ? "En vivo" : "Agenda"}</p>
      <h2 class="font-display text-4xl text-line sm:text-5xl">
        {mode === "live" ? "En juego ahora" : dayLabel(date)}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {loading ? "Cargando partidos…" : `${visible.length} partido${visible.length === 1 ? "" : "s"}`}
        {#if source === "odds"}· con cuotas del día{/if}
        {#if source === "categories"}· armado por categoría{/if}
        {#if notice}<span class="mt-1 block text-clay">{notice}</span>{/if}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2 {mode === 'live' ? 'hidden' : ''}">
      <button class="rounded-full border border-line/15 px-3 py-1.5 text-sm hover:border-line/40" onclick={() => ondate(shiftDate(date, -1))}>Ayer</button>
      <button class="rounded-full border border-line/15 px-3 py-1.5 text-sm hover:border-line/40" onclick={() => ondate(todayIso())}>Hoy</button>
      <button class="rounded-full border border-line/15 px-3 py-1.5 text-sm hover:border-line/40" onclick={() => ondate(shiftDate(date, 1))}>Mañana</button>
      <label class="sr-only" for="fecha">Fecha</label>
      <input
        id="fecha"
        class="rounded-full border border-line/15 bg-court px-3 py-1.5 text-sm text-line"
        type="date"
        value={date}
        onchange={(event) => ondate(event.currentTarget.value)}
      />
    </div>
  </div>

  <div class="mb-4 flex flex-wrap gap-2">
    {#each filters as item}
      <button
        class="rounded-full px-3 py-1 text-sm {filter === item.id ? 'bg-ball text-ink' : 'bg-court text-muted hover:text-line'}"
        onclick={() => (filter = item.id)}
      >
        {item.label}
      </button>
    {/each}
  </div>

  {#if error}
    <p class="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-line">{error}</p>
  {:else if loading}
    <div class="space-y-3" aria-hidden="true">
      {#each [1, 2, 3] as row}
        <div class="h-24 animate-pulse rounded-2xl bg-court"></div>
      {/each}
    </div>
  {:else if groups.length === 0}
    <div class="rounded-3xl border border-dashed border-line/20 px-6 py-14 text-center">
      <p class="font-display text-3xl">La pista está vacía</p>
      <p class="mt-2 text-sm text-muted">
        {mode === "live"
          ? "No hay partidos en juego en este momento."
          : "No hay partidos para esta fecha y filtro. Prueba otro día."}
      </p>
    </div>
  {:else}
    <div class="space-y-6">
      {#each groups as group (group.key)}
        <article class="overflow-hidden rounded-3xl border border-line/10 bg-court/80">
          <header class="flex items-baseline justify-between gap-3 border-b border-line/10 px-4 py-3 sm:px-5">
            <div class="min-w-0">
              <p class="text-[11px] uppercase tracking-[0.18em] {categoryTone(group.category) === 'wta' ? 'text-ball' : 'text-clay'}">
                {group.category || "Tenis"}
              </p>
              <h3 class="truncate font-display text-2xl">{group.name}</h3>
            </div>
            {#if group.surface}
              <p class="shrink-0 text-xs uppercase tracking-[0.14em] text-muted">{group.surface}</p>
            {/if}
          </header>
          {#each group.matches as match (match.id)}
            <MatchRow {match} {onopen} />
          {/each}
        </article>
      {/each}
    </div>
  {/if}

  {#if mode === "live"}
    <p class="mt-4 text-xs text-muted">
      El marcador se actualiza solo cada 30 segundos.
      <button class="ml-2 underline" onclick={onrefresh}>Actualizar ahora</button>
    </p>
  {/if}
</section>
