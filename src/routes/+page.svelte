<script lang="ts">
    import { resolve } from "$app/paths";
    import { increment, counter } from "$live/counter";

    let connecting = $derived($counter === undefined);
</script>

<div class="mx-auto max-w-2xl px-4 py-16 text-center">
    <p class="text-xs font-semibold uppercase tracking-widest text-amber-300">
        svelte-realtime · socket probe
    </p>
    <h1 class="mt-2 text-2xl font-bold tracking-tight">Shared counter</h1>

    <p
        id="count"
        class="mt-6 font-mono text-7xl font-bold tabular-nums tracking-tight"
        aria-live="polite"
        aria-atomic="true"
    >
        {#if connecting}
            Connecting…
        {:else}
            {$counter}
        {/if}
    </p>

    <button
        id="inc"
        class="mt-6 rounded-lg bg-amber-400 px-6 py-2.5 text-lg font-semibold text-zinc-950 motion-safe:transition-colors hover:bg-amber-300 disabled:opacity-50"
        onclick={() => increment()}
    >
        +1
    </button>

    <p
        class="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-400"
    >
        <span
            class={[
                "inline-block size-2 rounded-full",
                connecting
                    ? "bg-amber-300"
                    : "bg-emerald-300 motion-safe:animate-pulse",
            ]}
            aria-hidden="true"
        ></span>
        {#if connecting}
            Connecting to the socket…
        {:else}
            Live — open a second tab and watch it sync
        {/if}
    </p>

    <hr class="my-8 border-zinc-800" />

    <a
        href={resolve("/demo/quiz")}
        class="font-medium text-amber-300 underline-offset-4 hover:underline"
    >
        Try the quiz duel →
    </a>
</div>
