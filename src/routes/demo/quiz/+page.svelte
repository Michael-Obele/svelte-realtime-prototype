<script lang="ts">
    import { duel } from "$live/duel";
    import { empty } from "svelte-realtime/client";
    import { resolve } from "$app/paths";
    import { shortName, tabPlayerId } from "$lib/player-id";

    const matchId = "demo";
    // Static for the life of the tab: identifies our own roster/scoreboard row.
    const myId = tabPlayerId();

    const duelData = duel.data(matchId);
    // presence is optional in the room type (rooms without presence don't emit
    // it); empty is the library's always-undefined fallback for conditional
    // streams, and the ($roster ?? []) below already handles it.
    const roster = duel.presence?.(matchId) ?? empty;
    const dataError = duelData.error;

    let pending = $state<"idle" | "starting" | "answering" | "nexting">("idle");
    let feedback = $state<string | null>(null);
    let feedbackFor = $state<number | null>(null);
    let answeredIdx = $state<number | null>(null);
    let error = $state<string | null>(null);

    let snapshot = $derived($duelData);
    let status = $derived(snapshot?.status ?? null);
    let question = $derived(snapshot?.question ?? null);
    let scores = $derived(snapshot?.scores ?? []);
    let players = $derived(
        ($roster ?? []).map(
            (entry: { key: string; data?: { name?: string } }) => ({
                id: entry.key,
                name: entry.data?.name ?? entry.key.slice(0, 4),
            }),
        ),
    );
    let visibleFeedback = $derived(
        feedbackFor !== null &&
            question !== null &&
            feedbackFor === question.index
            ? feedback
            : null,
    );
    let answeredCurrent = $derived(
        question !== null && answeredIdx === question.index,
    );
    let connecting = $derived(snapshot === undefined);

    async function onStart() {
        pending = "starting";
        error = null;
        feedback = null;
        feedbackFor = null;
        try {
            await duel.start(matchId);
            answeredIdx = null;
        } catch (e) {
            error = e instanceof Error ? e.message : "Start failed";
        } finally {
            pending = "idle";
        }
    }

    async function onAnswer(choice: number) {
        if (question === null || pending !== "idle") return;
        pending = "answering";
        error = null;
        try {
            const result = await duel.answer(matchId, choice);
            answeredIdx = question.index;
            feedbackFor = question.index;
            feedback = result?.correct
                ? "Correct! +1"
                : "Wrong — no point this round.";
        } catch (e) {
            error = e instanceof Error ? e.message : "Answer failed";
        } finally {
            pending = "idle";
        }
    }

    async function onNext() {
        pending = "nexting";
        error = null;
        try {
            await duel.next(matchId);
        } catch (e) {
            error = e instanceof Error ? e.message : "Next failed";
        } finally {
            pending = "idle";
        }
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <a
        href={resolve("/")}
        class="text-sm font-medium text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline"
    >
        ← Shared counter
    </a>
    <h1 class="mt-4 text-2xl font-bold tracking-tight">Quiz duel demo</h1>
    <p id="duel-hint" class="mt-1 text-zinc-400">
        Fixed room <code class="rounded bg-zinc-900 px-1 text-amber-300"
            >demo</code
        >. Open a second tab to duel — both tabs stay in sync.
    </p>
    {#if myId}
        <p id="you-are" class="mt-1 text-zinc-400">
            You are {shortName(myId)} — reloading keeps your seat.
        </p>
    {/if}

    <p id="duel-status" class="mt-4 text-lg font-medium" aria-live="polite">
        {#if connecting}
            Connecting…
        {:else if status === "lobby"}
            Lobby — press Start when both players are here.
        {:else if status === "playing"}
            Question {(question?.index ?? 0) + 1} of {question?.total ?? 0}
        {:else if status === "finished"}
            Finished — press Start to play again.
        {/if}
    </p>

    {#if $dataError}
        <p
            id="duel-subscribe-error"
            class="mt-2 font-medium text-red-300"
            role="alert"
        >
            Subscription error: {$dataError.message}
        </p>
    {/if}

    <p id="player-count" class="mt-4 font-medium">
        {players.length} playing
    </p>
    {#if players.length > 0}
        <ul id="player-list" class="mt-1 list-disc pl-5">
            {#each players as player (player.id)}
                <li>{player.name}</li>
            {/each}
        </ul>
    {/if}

    {#if question}
        <section aria-label="Current question" class="mt-4">
            <h2 id="question" class="text-xl font-semibold">
                {question.text}
            </h2>
            <div id="choices" class="mt-3 flex max-w-md flex-col gap-2">
                {#each question.choices as choice, i (choice)}
                    <button
                        class="rounded-lg border border-zinc-500 bg-zinc-900 px-4 py-2 text-left motion-safe:transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={pending !== "idle" || answeredCurrent}
                        onclick={() => onAnswer(i)}
                    >
                        {choice}
                    </button>
                {/each}
            </div>
        </section>
    {/if}

    {#if visibleFeedback}
        <p
            id="feedback"
            class="mt-3 font-semibold text-amber-300"
            aria-live="polite"
        >
            {visibleFeedback}
        </p>
    {/if}

    {#if error}
        <p id="duel-error" class="mt-2 font-medium text-red-300" role="alert">
            {error}
        </p>
    {/if}

    {#if scores.length > 0}
        <h2 class="mt-6 text-lg font-semibold">Scoreboard</h2>
        <ol id="scoreboard" class="mt-1 list-decimal pl-5">
            {#each scores as entry (entry.id)}
                <li class={{ "font-bold text-amber-300": entry.id === myId }}>
                    {entry.name}: {entry.score}
                </li>
            {/each}
        </ol>
    {/if}

    <div id="controls" class="mt-6">
        {#if status === "lobby" || status === "finished"}
            <button
                id="start"
                class="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-zinc-950 motion-safe:transition-colors hover:bg-amber-300 disabled:opacity-50"
                disabled={pending !== "idle"}
                onclick={onStart}
            >
                {pending === "starting"
                    ? "Starting…"
                    : status === "finished"
                      ? "Play again"
                      : "Start"}
            </button>
        {:else if status === "playing"}
            <button
                id="next"
                class="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-zinc-950 motion-safe:transition-colors hover:bg-amber-300 disabled:opacity-50"
                disabled={pending !== "idle"}
                onclick={onNext}
            >
                {pending === "nexting" ? "Next…" : "Next question"}
            </button>
        {/if}
    </div>
</div>
