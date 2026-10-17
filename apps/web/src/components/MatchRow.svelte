<script>
  import { clock, flag, oddsText, statusLabel } from "../lib/format.js";

  let { match, onopen } = $props();

  const live = $derived(match.status?.type === "inprogress");
  const finished = $derived(match.status?.type === "finished");
  const sets = $derived(Math.max(match.homeSets.length, match.awaySets.length));
</script>

<button
  class="group grid w-full grid-cols-[4.5rem_1fr] gap-3 border-b border-line/10 px-4 py-4 text-left transition hover:bg-line/5 sm:grid-cols-[5.5rem_1fr_auto] sm:px-5"
  onclick={() => onopen(match.id)}
>
  <div class="pt-0.5">
    <p class="text-sm font-medium tabular-nums text-line">{clock(match.startTimestamp)}</p>
    <p class="mt-1 text-[11px] uppercase tracking-[0.14em] {live ? 'text-ball' : 'text-muted'}">
      {#if live}<span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ball"></span>{/if}
      {statusLabel(match.status)}
    </p>
  </div>

  <div class="min-w-0 space-y-1.5">
    {#each [["home", match.home, match.homeSets, match.homePoints], ["away", match.away, match.awaySets, match.awayPoints]] as [side, player, playerSets, points]}
      <div class="flex items-center gap-2">
        <span class="w-6 text-center text-sm" aria-hidden="true">{flag(player.country)}</span>
        <span
          class="min-w-0 flex-1 truncate text-[15px] {finished && match.winnerCode === (side === 'home' ? 1 : 2)
            ? 'font-medium text-line'
            : finished
              ? 'text-muted'
              : 'text-line'}"
        >
          {player.name}
        </span>
        <span class="flex items-center gap-1 tabular-nums">
          {#each Array.from({ length: sets }) as _, index}
            <span class="w-5 text-center text-sm {playerSets[index] == null ? 'text-line/20' : 'text-line'}">
              {playerSets[index]?.games ?? ""}
              {#if playerSets[index]?.tiebreak != null}
                <sup class="text-[9px] text-muted">{playerSets[index].tiebreak}</sup>
              {/if}
            </span>
          {/each}
          {#if live && points}
            <span class="ml-1 min-w-6 text-center text-xs text-ball">{points}</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>

  <div class="col-span-2 hidden items-center gap-3 sm:col-span-1 sm:flex">
    {#if match.oddsPreview?.choices?.length}
      <div class="text-right">
        <p class="text-[10px] uppercase tracking-[0.16em] text-muted">Cuota</p>
        <p class="font-display text-lg leading-none text-line">
          {oddsText(match.oddsPreview.choices[0])}
          <span class="px-1 text-muted">/</span>
          {oddsText(match.oddsPreview.choices[1])}
        </p>
      </div>
    {/if}
    <span class="text-clay transition group-hover:translate-x-0.5" aria-hidden="true">→</span>
  </div>
</button>
