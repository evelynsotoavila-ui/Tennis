<script>
  import { onMount } from "svelte";
  import EntityCard from "./components/EntityCard.svelte";
  import MatchDetail from "./components/MatchDetail.svelte";
  import Rankings from "./components/Rankings.svelte";
  import Schedule from "./components/Schedule.svelte";
  import { getJson } from "./lib/api.js";
  import { todayIso } from "./lib/format.js";

  function parseHash(hash) {
    const value = (hash || "").replace(/^#/, "") || "/agenda";
    const match = value.match(/^\/partido\/(\d+)/);
    const person = value.match(/^\/ficha\/(team|player)\/(\d+)/);
    if (match) return { view: "partido", matchId: match[1], entity: null };
    if (person) return { view: "ficha", matchId: null, entity: { type: person[1], id: person[2] } };
    if (value.startsWith("/en-vivo")) return { view: "envivo", matchId: null, entity: null };
    if (value.startsWith("/rankings")) return { view: "rankings", matchId: null, entity: null };
    return { view: "agenda", matchId: null, entity: null };
  }

  const initialRoute = parseHash(location.hash);
  let view = $state(initialRoute.view);
  let date = $state(todayIso());
  let matchId = $state(initialRoute.matchId);
  let entity = $state(initialRoute.entity);
  let events = $state([]);
  let source = $state("");
  let notice = $state("");
  let loading = $state(false);
  let error = $state("");
  let query = $state("");
  let results = $state([]);
  let searching = $state(false);
  let searchError = $state("");
  let configured = $state(null);
  let requestId = 0;

  function applyRoute() {
    const next = parseHash(location.hash);
    view = next.view;
    matchId = next.matchId;
    entity = next.entity;
  }

  function go(hash) {
    if (location.hash === `#${hash}`) applyRoute();
    location.hash = hash;
  }

  async function loadAgenda(nextDate = date) {
    const current = ++requestId;
    loading = true;
    error = "";
    try {
      const data = await getJson(`/api/matches?date=${nextDate}`);
      if (current !== requestId) return;
      events = data.events || [];
      source = data.source || "";
      notice = data.notice || "";
    } catch (reason) {
      if (current !== requestId) return;
      events = [];
      notice = "";
      error = reason.message;
    } finally {
      if (current === requestId) loading = false;
    }
  }

  async function loadLive() {
    const current = ++requestId;
    loading = true;
    error = "";
    try {
      const data = await getJson("/api/live");
      if (current !== requestId) return;
      events = data.events || [];
      source = "live";
      notice = "";
    } catch (reason) {
      if (current !== requestId) return;
      events = [];
      error = reason.message;
    } finally {
      if (current === requestId) loading = false;
    }
  }

  function refresh() {
    if (view === "envivo") loadLive();
    else if (view === "agenda") loadAgenda(date);
  }

  onMount(() => {
    getJson("/health")
      .then((data) => {
        configured = data.rapidConfigured !== false;
      })
      .catch(() => {});
    const onHash = () => applyRoute();
    window.addEventListener("hashchange", onHash);
    const timer = setInterval(() => {
      if (view === "envivo") loadLive();
    }, 60000);
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearInterval(timer);
    };
  });

  $effect(() => {
    if (view === "agenda") loadAgenda(date);
    if (view === "envivo") loadLive();
  });

  let searchTimer;
  function onQuery(value) {
    query = value;
    clearTimeout(searchTimer);
    if (value.trim().length < 2) {
      results = [];
      searchError = "";
      return;
    }
    searchTimer = setTimeout(async () => {
      searching = true;
      searchError = "";
      try {
        const data = await getJson(`/api/search?q=${encodeURIComponent(value.trim())}`);
        results = data.results || [];
      } catch (reason) {
        results = [];
        searchError = reason.message;
      } finally {
        searching = false;
      }
    }, 280);
  }

  function openEntity(result) {
    if (!result.id || (result.type !== "player" && result.type !== "team")) {
      searchError = "Esa ficha no abre un jugador. Prueba con un nombre de tenista.";
      return;
    }
    const type = result.type === "player" ? "player" : "team";
    results = [];
    query = "";
    go(`/ficha/${type}/${result.id}`);
  }
</script>

<div class="min-h-screen">
  <header class="sticky top-0 z-20 border-b border-line/10 bg-ink/90 backdrop-blur">
    <div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <a class="block" href="#/agenda">
          <span class="font-display text-3xl leading-none tracking-tight">Cancha</span>
          <span class="mt-1 block text-[11px] uppercase tracking-[0.22em] text-muted">Marcador y cuotas</span>
        </a>
        <nav class="flex gap-1 rounded-full bg-court p-1 text-sm">
          <a class="rounded-full px-3 py-1.5 {view === 'agenda' ? 'bg-line text-ink' : 'text-muted'}" href="#/agenda">Agenda</a>
          <a class="rounded-full px-3 py-1.5 {view === 'envivo' ? 'bg-ball text-ink' : 'text-muted'}" href="#/en-vivo">En vivo</a>
          <a class="rounded-full px-3 py-1.5 {view === 'rankings' ? 'bg-line text-ink' : 'text-muted'}" href="#/rankings">Rankings</a>
        </nav>
      </div>

      <div class="relative">
        <label class="sr-only" for="buscar">Buscar jugador</label>
        <input
          id="buscar"
          class="w-full rounded-2xl border border-line/15 bg-court px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-ball"
          placeholder="Buscar jugador o torneo"
          value={query}
          oninput={(event) => onQuery(event.currentTarget.value)}
          onkeydown={(event) => {
            if (event.key === "Escape") {
              results = [];
              searchError = "";
            }
          }}
        />
        {#if searching || results.length || searchError}
          <div class="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-line/15 bg-panel shadow-2xl">
            {#if searching}
              <p class="px-4 py-3 text-sm text-muted">Buscando…</p>
            {:else if searchError}
              <p class="px-4 py-3 text-sm text-miss">{searchError}</p>
            {:else}
              {#each results as result (`${result.type}:${result.id}:${result.name}`)}
                <button
                  class="block w-full border-b border-line/10 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-line/5"
                  onclick={() => openEntity(result)}
                >
                  <span class="block">{result.name}</span>
                  <span class="text-xs uppercase tracking-[0.14em] text-muted">{result.type}{result.country ? ` · ${result.country}` : ""}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </header>

  {#if configured === false}
    <p class="mx-auto mt-6 max-w-5xl px-4 text-sm sm:px-6">
      <span class="block rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3">
        El servidor no tiene RAPIDAPI_KEY. Copia .env.example a .env en local, o define la variable en Render.
      </span>
    </p>
  {/if}

  <main class="pt-8">
    {#if view === "partido" && matchId}
      <MatchDetail
        id={matchId}
        onback={(nextId) => {
          if (typeof nextId === "string" || typeof nextId === "number") go(`/partido/${nextId}`);
          else go("/agenda");
        }}
      />
    {:else if view === "ficha" && entity}
      <EntityCard type={entity.type} id={entity.id} onopen={(id) => go(`/partido/${id}`)} onback={() => go("/agenda")} />
    {:else if view === "rankings"}
      <Rankings onopen={(id) => go(`/ficha/team/${id}`)} />
    {:else}
      <Schedule
        mode={view === "envivo" ? "live" : "agenda"}
        {date}
        {events}
        {loading}
        {error}
        {source}
        {notice}
        onrefresh={refresh}
        ondate={(next) => {
          date = next;
          if (view !== "agenda") go("/agenda");
        }}
        onopen={(id) => go(`/partido/${id}`)}
      />
    {/if}
  </main>

  <footer class="mx-auto flex max-w-5xl flex-col gap-2 px-4 pb-10 text-xs text-muted sm:px-6 sm:flex-row sm:justify-between">
    <p>Datos de TennisApi en RapidAPI. Las cuotas son referenciales y no son una casa de apuestas.</p>
    <p>Bookmaker 1 · getMatchBettingOdds</p>
  </footer>
</div>
