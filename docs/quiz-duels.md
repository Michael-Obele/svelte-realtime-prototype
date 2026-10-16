# Quiz duels with SvelteKit and svelte-realtime

A setup guide for building realtime head-to-head quizzes, written to be followed start to finish. It assumes you already have a SvelteKit app, a database, and a session cookie from an auth setup. Nothing about your existing app needs to change.

Everything here was verified on Node 24 with SvelteKit 2.70.3 and svelte-realtime 0.5.13. Where something is untested, it says so.

## 1. What you need

| Requirement                                            | Why                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Node 22 or newer (24 is fine)                          | The library's engine floor is Node 22, and the native server binary is picked by Node's ABI              |
| glibc 2.38 or newer                                    | Debian Trixie or Ubuntu 24.04 base images. Not Alpine: the binaries are compiled against glibc, not musl |
| A Node host you control (VPS, container, Fly, Railway) | Serverless cannot hold a socket open. This is true of any WebSocket library                              |
| Your existing database and session cookie              | Identity comes from the cookie you already have                                                          |

You do not need Redis, Docker, or any paid service for a single-instance duel.

## 2. Install

```sh
bun add svelte-adapter-uws svelte-realtime
bun add uNetworking/uWebSockets.js#v20.71.0
bun add -d ws typescript
```

If you are not on Bun, the npm equivalents are the same packages with `npm i` instead of `bun add`. The one that is easy to get wrong is uWebSockets.js: it installs from GitHub, not npm, and there is no `@` prefix.

About that dependency, because it wastes an afternoon if you do not know:

- It is a native addon. The repo contains prebuilt binaries and no install script, so nothing compiles.
- The binary is chosen by Node's ABI version, not by platform alone: Node 22 uses `uws_linux_x64_127.node`, Node 24 uses `_137`, Node 26 uses `_147`.
- **The version matters.** v20.60.0 predates Node 24 support; v20.71.0 supports Node 22, 24 and 26. If you see `Could not load uWebSockets.js`, check this first.
- Installing it as a git dependency can be slow, since it pulls a large repo. A shallow clone plus a `file:` dependency is faster and more predictable:

```sh
git clone --depth 1 --single-branch --branch v20.71.0 \
  https://github.com/uNetworking/uWebSockets.js.git vendor/uWebSockets.js
# then in package.json:  "uWebSockets.js": "file:vendor/uWebSockets.js"
```

## 3. The five files

**`svelte.config.js`** (SvelteKit 2 keeps config here; SvelteKit 3 moves it into `vite.config.ts`):

```js
import adapter from "svelte-adapter-uws";

export default {
  kit: {
    adapter: adapter({ websocket: true }),
  },
};
```

**`vite.config.ts`** - all three plugins are required. The `ws` package is what gives you a working socket in dev; production uses the native server:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import uws from "svelte-adapter-uws/vite";
import realtime from "svelte-realtime/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit(), uws(), realtime()],
});
```

**`src/hooks.ws.ts`** - the WebSocket lifecycle file. `message` is the framework's router and must be exported, otherwise every call silently times out. `upgrade` is where your existing session cookie becomes a user:

```ts
import { message } from "svelte-realtime/server";

export { message };

export function upgrade({ cookies }) {
  const session = validateSession(cookies.session_id); // your existing helper
  if (!session) return false; // rejects with 401
  return { id: session.userId, name: session.name }; // becomes ctx.user
}
```

**`src/live/duel.ts`** - the server-side logic. Everything in `src/live/` runs on the server only.

**`tsconfig.json`** - `extends: "./.svelte-kit/tsconfig.json"` with `strict: true`. Write the live modules as `.ts`, matching the library's own template.

Run it with `bun run dev`. You should see `[adapter-uws] Dev WebSocket endpoint at /ws` at startup. If you see a warning about a missing `_guard`, that is the library asking you to declare who may call your functions; see section 5.

One gotcha worth writing down now: **`vite preview` cannot do WebSockets.** It is Vite's own HTTP server. Use `bun run build` and then `node build`.

## 4. Model the duel as a room

`svelte-realtime` has a `live.room()` primitive that folds a topic, its data, presence and actions into one declaration. That maps onto a quiz duel almost directly: one room per match, the room's data is the match state, presence is the player list, and the actions are the moves.

```ts
// src/live/duel.ts
import { live, LiveError } from "svelte-realtime/server";
import { db } from "$lib/server/db";

export const duel = live.room({
  // The topic is dynamic, so every match gets its own channel.
  topic: (ctx, matchId: string) => `match:${matchId}`,

  // What a subscriber gets when it joins.
  init: async (ctx, matchId: string) => ({
    match: await db.matches.byId(matchId),
    question: await db.questions.current(matchId),
    scores: await db.scores.forMatch(matchId),
  }),

  // Who is here, rendered as live avatars.
  presence: (ctx) => ({ id: ctx.user.id, name: ctx.user.name }),

  // The guard gets the same leading args as topic and init, so it can check
  // this specific match rather than just "some logged in user".
  guard: async (ctx, matchId: string) => {
    if (!ctx.user) throw new LiveError("UNAUTHORIZED");
    if (!(await db.matches.hasPlayer(ctx.user.id, matchId))) {
      throw new LiveError("FORBIDDEN");
    }
  },

  actions: {
    // Only the host advances the quiz.
    start: async (ctx, matchId: string) => {
      if (ctx.user.id !== (await db.matches.host(matchId))) {
        throw new LiveError("FORBIDDEN", "Only the host can start");
      }
      const question = await db.questions.next(matchId);
      ctx.publish("question", question); // reaches everyone in the room
      return question;
    },

    // Answers are scored on the server. Never trust a client with the score.
    answer: async (ctx, matchId: string, choice: number) => {
      if (ctx.skip(`answer:${matchId}:${ctx.user.id}`, 500)) {
        throw new LiveError("RATE_LIMITED", "Slow down");
      }
      const result = await db.answers.submit(matchId, ctx.user.id, choice);
      ctx.publish("scored", result);
      return result; // this is the reply to the caller, the "ack"
    },
  },
});
```

Client side, the same file becomes an importable object with streams and actions:

```html
<!-- src/routes/match/[id]/+page.svelte -->
<script lang="ts">
  import { duel } from "$live/duel";

  let { data } = $props();

  const state = duel.data(data.matchId); // live match state
  const players = duel.presence(data.matchId); // live player list
</script>

<p>{$players.length} playing</p>

{#if $state?.question}
<h2>{$state.question.text}</h2>
{#each $state.question.choices as choice, i}
<button onclick="{()" ="">duel.answer(data.matchId, i)}>{choice}</button>
{/each} {/if}
```

Note what happened to the pieces you would write by hand with Socket.IO:

| You would write                         | You write instead                                   |
| --------------------------------------- | --------------------------------------------------- |
| A room-join message and a join handler  | Nothing. Subscribing to the room's streams joins it |
| A broadcast helper looping over sockets | `ctx.publish('question', data)`                     |
| A message-type switch statement         | A named action, called like a function              |
| A callback to confirm the score         | The action's return value                           |
| Who-is-online tracking                  | `presence`, with multi-tab dedup                    |

## 5. Auth and access control

Three different gates, and you want all three:

- **`upgrade()`** in `src/hooks.ws.ts` decides who gets a socket at all. Use the same session cookie your app already sets.
- **`_guard`** in a live module decides who may call the functions in that file. Without one, the library warns at startup, because any connected client can call any function in the module. For a public demo, add the comment `// realtime-allow-public` to declare that on purpose.
- **`access`** on a stream decides who may subscribe. Useful when a topic holds something not everyone in the room should see.

Guards compose, and a guard can enrich the context for later ones. Errors thrown as `LiveError('UNAUTHORIZED')` or `LiveError('FORBIDDEN')` come back to the client as failures, not as silent hangs.

The rule that matters most for a quiz: **score on the server, and send only what the player is allowed to know.** Anything you return from a live function is sent to the client, so keep the answer key out of `init` for a player who is about to answer.

## 6. The traps

These are the ones that actually bite:

| Trap                            | What happens                                                      | Fix                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `vite preview`                  | WebSockets never connect                                          | Use `node build`                                                                                                 |
| A hidden browser tab            | Stream updates stop being applied until the tab is visible again  | Nothing to fix for players. Do not park a scoreboard in a background tab and expect it to stay live              |
| Wrong uWebSockets.js version    | `Could not load uWebSockets.js` at startup                        | Match the version to your Node ABI, see section 2                                                                |
| Alpine base image               | The binary cannot load                                            | Use Debian Trixie or Ubuntu 24.04+                                                                               |
| Missing `message` export        | Every call times out with no error                                | Re-export `message` from `svelte-realtime/server` in `src/hooks.ws.ts`                                           |
| Topic names starting with `__`  | `publish` rejects them                                            | That prefix is reserved for the framework                                                                        |
| Renaming a live module's export | The generated stub changes shape, the client breaks at build time | Treat `src/live/` exports as your client API                                                                     |
| Two servers, one user           | Each process only reaches its own clients                         | For multiple cores use `CLUSTER_WORKERS=auto` (built-in relay). For multiple machines, wire the Redis extensions |
| Client-sent scores              | Cheating                                                          | Score in the action, as in the example above                                                                     |

## 7. Order of work

Each step is independently testable, which is the point. Do not move on until the previous one works in two browser windows.

1. **Room renders.** Add `live.room()`, render `duel.data(matchId)`, and confirm two windows show the same state.
2. **Presence.** Render `duel.presence(matchId)` and confirm each window sees the other player. This is your lobby.
3. **Start.** Host calls `duel.start(matchId)` and both windows receive the question. That proves server-to-client fan-out.
4. **Answer.** A player calls `duel.answer(...)`, the server scores it, and the return value updates that player's UI. That proves client-to-server plus the reply.
5. **Scoreboard.** Stream the scores with merge mode `'crud'` keyed on the player id, or `'latest'` if you only want recent events.
6. **Auth.** Swap the scaffolded `upgrade()` for one that reads your real session cookie, then add a `_guard` and an `access` check.
7. **Reconnect.** Add `replay: true` to the streams so a player who drops mid-question gets the gap filled on reconnect.
8. **Deploy.** `node build` behind TLS, with `PORT` and `ORIGIN` set. Add `CLUSTER_WORKERS=auto` if you have spare cores.

## 8. Honest caveats

- **The library is young.** Version 0.5.x, one main author, roughly a hundred stars. The pair of packages move together, and peer versions are checked at install time. Read the changelog before upgrading.
- **Node only.** uWebSockets.js is a native addon, so this does not run on Bun, Deno, Cloudflare or Vercel.
- **SvelteKit 2 is the supported version.** The peer range is `@sveltejs/kit: ^2`. On SvelteKit 3, config moves from `svelte.config.js` into `vite.config.ts`; that has not been tested here.
- **Two rough edges found while testing.** The scaffolder (`bunx svelte-realtime`) hung instead of installing, so set the project up by hand as above. And the version it pins for uWebSockets.js predates Node 24, which is why section 2 tells you to install a newer one.
- **If you deploy to serverless**, none of this applies. Use polling or server-sent events instead.

## Links

- svelte-realtime docs, especially [Rooms](https://svelte-realtime.dev/docs/rooms), [Auth](https://svelte-realtime.dev/docs/auth), [the ctx object](https://svelte-realtime.dev/docs/ctx) and [Architecture](https://svelte-realtime.dev/docs/architecture)
- Adapter [configuration](https://svelte-realtime.dev/docs/ecosystem/adapter/config), [plugins](https://svelte-realtime.dev/docs/ecosystem/adapter/plugins) and [deployment](https://svelte-realtime.dev/docs/ecosystem/adapter/deployment)
- The full demo app (collaborative sticky notes) is the best worked example: [docs](https://svelte-realtime.dev/docs/ecosystem/demo/getting-started)
- A working minimal project with the wiring above: [svelte-realtime-prototype](https://github.com/Michael-Obele/svelte-realtime-prototype)
