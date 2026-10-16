// realtime-allow-public - declared intentionally open for this demo. A real app
// should use a _guard instead (see the startup warning).
import { live, LiveError } from "svelte-realtime/server";

type Status = "lobby" | "playing" | "finished";

interface ServerQuestion {
  text: string;
  choices: string[];
  answer: number;
}

interface PublicQuestion {
  text: string;
  choices: string[];
  index: number;
  total: number;
}

interface ScoreEntry {
  id: string;
  name: string;
  score: number;
}

interface DuelState {
  matchId: string;
  status: Status;
  question: PublicQuestion | null;
  scores: ScoreEntry[];
}

interface Match {
  status: Status;
  questionIndex: number;
  scores: Map<string, number>;
  names: Map<string, string>;
  answered: Set<string>;
}

const QUESTIONS: ServerQuestion[] = [
  {
    text: "Which rune creates reactive state in Svelte 5?",
    choices: ["$state", "$effect", "$props", "$inspect"],
    answer: 0,
  },
  {
    text: "Which merge strategy replaces the whole stream value?",
    choices: ["crud", "latest", "presence", "set"],
    answer: 3,
  },
  {
    text: "Where does `src/live/` code run?",
    choices: ["Browser only", "Server only", "Both", "Edge only"],
    answer: 1,
  },
];

const matches = new Map<string, Match>();

function displayName(ctx: { user: { id: string; name?: string } }): string {
  const raw = ctx.user?.name ?? ctx.user.id.slice(0, 4);
  return `Guest-${raw}`;
}

function rememberName(
  ctx: { user: { id: string; name?: string } },
  match: Match,
): void {
  if (!match.names.has(ctx.user.id)) {
    match.names.set(ctx.user.id, displayName(ctx));
  }
  if (!match.scores.has(ctx.user.id)) {
    match.scores.set(ctx.user.id, 0);
  }
}

function getMatch(matchId: string): Match {
  let match = matches.get(matchId);
  if (!match) {
    match = {
      status: "lobby",
      questionIndex: 0,
      scores: new Map(),
      names: new Map(),
      answered: new Set(),
    };
    matches.set(matchId, match);
  }
  return match;
}

function toPublic(matchId: string, match: Match): DuelState {
  const scores: ScoreEntry[] = [...match.scores.entries()].map(
    ([id, score]) => ({
      id,
      name: match.names.get(id) ?? id.slice(0, 4),
      score,
    }),
  );
  scores.sort((a, b) => b.score - a.score);

  if (match.status !== "playing") {
    return { matchId, status: match.status, question: null, scores };
  }
  const current = QUESTIONS[match.questionIndex];
  if (!current) {
    return { matchId, status: "finished", question: null, scores };
  }
  return {
    matchId,
    status: match.status,
    question: {
      text: current.text,
      choices: current.choices,
      index: match.questionIndex,
      total: QUESTIONS.length,
    },
    scores,
  };
}

function publishState(ctx: { publish: unknown }, state: DuelState): void {
  // Inside live.room() actions the runtime rebinds ctx.publish to
  // (event, data) with the room topic pre-filled; the shared LiveContext
  // type still shows the 3-arg (topic, event, data) form.
  (ctx.publish as (event: string, data: DuelState) => void)("set", state);
}

export const duel = live.room({
  topic: (ctx, matchId: string) => `duel:${matchId}`,
  topicArgs: 1,
  merge: "set",

  init: async (ctx, matchId: string) => {
    const match = getMatch(matchId);
    rememberName(ctx, match);
    return toPublic(matchId, match);
  },

  presence: (ctx) => ({ id: ctx.user.id, name: displayName(ctx) }),

  actions: {
    start: async (ctx, matchId: string) => {
      const match = getMatch(matchId);
      rememberName(ctx, match);
      match.status = "playing";
      match.questionIndex = 0;
      match.answered = new Set();
      for (const id of match.scores.keys()) {
        match.scores.set(id, 0);
      }
      const state = toPublic(matchId, match);
      publishState(ctx, state);
      return state;
    },

    answer: async (ctx, matchId: string, choice: number) => {
      if (ctx.skip(`answer:${matchId}:${ctx.user.id}`, 500)) {
        throw new LiveError("RATE_LIMITED", "Slow down");
      }
      const match = getMatch(matchId);
      rememberName(ctx, match);
      if (match.status !== "playing") {
        throw new LiveError("INVALID_STATE", "Press Start first");
      }
      const current = QUESTIONS[match.questionIndex];
      if (!current) {
        throw new LiveError("INVALID_STATE", "Quiz is finished");
      }
      if (
        !Number.isInteger(choice) ||
        choice < 0 ||
        choice >= current.choices.length
      ) {
        throw new LiveError("INVALID_ARG", "Unknown choice");
      }
      if (match.answered.has(ctx.user.id)) {
        throw new LiveError("INVALID_STATE", "Already answered - press Next");
      }
      match.answered.add(ctx.user.id);
      const correct = choice === current.answer;
      if (correct) {
        match.scores.set(ctx.user.id, (match.scores.get(ctx.user.id) ?? 0) + 1);
      }
      const state = toPublic(matchId, match);
      publishState(ctx, state);
      return { correct, scores: state.scores };
    },

    next: async (ctx, matchId: string) => {
      const match = getMatch(matchId);
      rememberName(ctx, match);
      if (match.status !== "playing") {
        throw new LiveError("INVALID_STATE", "Press Start first");
      }
      match.questionIndex += 1;
      match.answered = new Set();
      if (match.questionIndex >= QUESTIONS.length) {
        match.status = "finished";
      }
      const state = toPublic(matchId, match);
      publishState(ctx, state);
      return state;
    },
  },
});
