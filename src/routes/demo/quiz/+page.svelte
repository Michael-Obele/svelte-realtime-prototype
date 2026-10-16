<script lang="ts">
    import { duel } from "$live/duel";
    import { empty } from "svelte-realtime/client";
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

<h1>Quiz duel demo</h1>
<p id="duel-hint">
    Fixed room <code>demo</code>. Open a second tab to duel — both tabs stay in
    sync.
</p>
{#if myId}
    <p id="you-are">You are {shortName(myId)} — reloading keeps your seat.</p>
{/if}

{#if connecting}
    <p id="duel-status">Connecting…</p>
{:else if status === "lobby"}
    <p id="duel-status">Lobby — press Start when both players are here.</p>
{:else if status === "playing"}
    <p id="duel-status">
        Question {(question?.index ?? 0) + 1} of {question?.total ?? 0}
    </p>
{:else if status === "finished"}
    <p id="duel-status">Finished — press Start to play again.</p>
{/if}

{#if $dataError}
    <p id="duel-subscribe-error" role="alert">
        Subscription error: {$dataError.message}
    </p>
{/if}

<p id="player-count">{players.length} playing</p>
{#if players.length > 0}
    <ul id="player-list">
        {#each players as player (player.id)}
            <li>{player.name}</li>
        {/each}
    </ul>
{/if}

{#if question}
    <section aria-label="Current question">
        <h2 id="question">{question.text}</h2>
        <div id="choices">
            {#each question.choices as choice, i (choice)}
                <button
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
    <p id="feedback" aria-live="polite">{visibleFeedback}</p>
{/if}

{#if error}
    <p id="duel-error" role="alert">{error}</p>
{/if}

{#if scores.length > 0}
    <h2>Scoreboard</h2>
    <ol id="scoreboard">
        {#each scores as entry (entry.id)}
            <li class={{ me: entry.id === myId }}>
                {entry.name}: {entry.score}
            </li>
        {/each}
    </ol>
{/if}

<div id="controls">
    {#if status === "lobby" || status === "finished"}
        <button id="start" disabled={pending !== "idle"} onclick={onStart}>
            {pending === "starting"
                ? "Starting…"
                : status === "finished"
                  ? "Play again"
                  : "Start"}
        </button>
    {:else if status === "playing"}
        <button id="next" disabled={pending !== "idle"} onclick={onNext}>
            {pending === "nexting" ? "Next…" : "Next question"}
        </button>
    {/if}
</div>

<style>
    h1 {
        font-size: 1.5rem;
        margin-bottom: 0.25rem;
    }
    #duel-hint {
        color: #555;
        margin-top: 0;
    }
    #choices {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 24rem;
        margin: 0.75rem 0;
    }
    button {
        padding: 0.5rem 0.75rem;
        font-size: 1rem;
        cursor: pointer;
    }
    button:disabled {
        cursor: default;
        opacity: 0.6;
    }
    #feedback {
        font-weight: 600;
    }
    #duel-error,
    #duel-subscribe-error {
        color: #a00;
    }
    #controls {
        margin-top: 1rem;
    }
    .me {
        font-weight: 700;
    }
</style>
