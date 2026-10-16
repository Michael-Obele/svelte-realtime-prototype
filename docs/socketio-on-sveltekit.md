# Socket.IO on SvelteKit: what actually transfers

You were told to use Socket.IO, and someone else said it is complicated to set up. Both are partly right. This note explains which part is hard, and what the Socket.IO vocabulary turns into on SvelteKit today.

Short version: **Socket.IO's API is not the hard part. SvelteKit is.** SvelteKit has no built-in WebSocket server, so every socket library needs you to run your own server. Once you accept that, Socket.IO on Node is a well-trodden path, and there is a newer Svelte-native alternative that removes most of the wiring.

## Why people say it is complicated

A `+server.js` endpoint cannot accept a WebSocket upgrade. It returns a `Response`, and the socket is already gone by then. So anything socket-shaped has to attach to the HTTP server that serves SvelteKit, in two places:

- **dev:** a Vite plugin that grabs Vite's own HTTP server
- **production:** a custom entry file that mounts SvelteKit's built handler

That is the whole reason for the reputation. Serverless hosts (Vercel, Netlify, Cloudflare Pages) do not keep a long-lived process, so they cannot do it at all. You need a Node host, a VPS, or a container.

## Path A: Socket.IO itself

Socket.IO is an MIT library you host yourself. It is not a service, and it is free. It works on Node, and since August 2025 it has an official Bun engine (`@socket.io/bun-engine`), so Bun is no longer a reason to avoid it.

What you write:

| File | Job |
| --- | --- |
| `src/lib/server/io.ts` | Creates the Socket.IO server once, holds rooms and handlers |
| `vite.config.ts` | A plugin that attaches it to Vite's HTTP server in dev |
| `server.js` | Creates the HTTP server, mounts `build/handler.js`, attaches Socket.IO |
| a client module | `socket.io-client`, initialised once behind a `browser` guard |

You get rooms (`socket.join`, `io.to(room).emit`), automatic reconnection with an offline buffer, acks, and per-socket auth from the session cookie. In production it is one process on one port. Express is not required; the plain Node HTTP server is enough.

On Bun, two things still rub. The official SvelteKit Bun adapter owns its own `Bun.serve` and does not expose WebSocket options, so the engine and SvelteKit fight over the server. And dev is the awkward case: the community workaround is to run the socket server as a separate process in dev and proxy `/ws` from Vite to it.

## Path B: svelte-realtime (Node only)

`svelte-realtime` is a newer library that takes the Socket.IO vocabulary and rebuilds it around SvelteKit. Two packages, both Node only:

- `svelte-adapter-uws` replaces Node's HTTP stack with uWebSockets.js, a C++ server with the WebSocket support built in
- `svelte-realtime` adds server functions, reactive streams, and rooms on top

The shape is different in a way that suits Svelte: you write a function on the server, import it in a component, and call it. The Vite plugin generates the client stub, so there is no manual wiring and no hand-written types.

## How Socket.IO concepts map

| Socket.IO | svelte-realtime | Verbatim? | What changes |
| --- | --- | --- | --- |
| Rooms: `socket.join()`, `io.to(room).emit()` | Topics: `ctx.publish(topic, event, data)` plus `live.stream(topic, …)`, or `live.room()` which bundles a topic, its data, presence and actions into one declaration | No | Membership is implicit. You are in a topic because you subscribed to its stream. No imperative join on the client. |
| Namespaces | **Nothing equivalent** | n/a | Nearest is one live module per feature, plus topic naming (`match:123`). |
| Acks: `socket.emit(x, data, cb)` | The return value of the function you call | No | `await startMatch(id)` gives you the result. The callback pattern disappears, which is a simplification. |
| `io.use()` middleware | `_guard` per module, `live.middleware()` globally, `live.scoped()` per function | No | Same idea, three different seams. |
| `socket.handshake.auth` | `upgrade()` in `src/hooks.ws.ts`, returning user data or `false` | No | Auth happens before the socket exists, using the normal session cookie. |
| Rooms per entity | Dynamic topics or `live.room()` | No | Room identity comes from a function, e.g. `(ctx, matchId) => 'match:' + matchId`. |
| `socket.io-client` | Generated `$live/*` stubs and the adapter's client stores | No | Different package, different mental model: call a function, subscribe to a stream. |
| Reconnection with backoff and buffering | Built in | Concept only | Nothing to configure the way `reconnectionDelay` works. |
| `connectionStateRecovery` | Replay: in-memory per topic, or Redis sorted sets with sequence numbers across restarts | No | Same goal, different mechanics. Ordering is guaranteed per topic. |
| `@socket.io/redis-adapter` for multiple servers | `svelte-adapter-uws-extensions` (Redis or Postgres pub/sub, presence, replay, rate limits) | No | Same trap as Socket.IO: the core `publish()` only reaches clients on the current process. |
| Sticky sessions | Not needed | n/a | `SO_REUSEPORT` lets several Node processes bind the same port, and the adapter relays publishes across worker threads for free. |
| HTTP long-polling fallback | **Nothing equivalent** | n/a | WebSocket only. If you depended on the fallback for hostile networks, that is gone. |

## What you cannot do

You cannot copy Socket.IO code, and you cannot follow its documentation as instructions. Both the API names and the wire protocol are different: Socket.IO speaks engine.io frames after a handshake, svelte-realtime speaks one JSON object per frame. Read Socket.IO's docs for the vocabulary (rooms, acks, middleware, recovery, adapters) and expect to write every line against different primitives.

Two Socket.IO features have no counterpart at all: **namespaces**, and the **transport fallback**.

## What might be simplest, given the goal

For two-player quiz duels, the honest ranking from simplest to most machinery:

1. **No sockets at all.** Poll a `+server.js` endpoint every second or two. A duel is turn-based; a one-second lag is invisible. Zero new dependencies, works on any host including serverless.
2. **Server-sent events** for server to client, with normal form posts going the other way. Still no socket library, still works on serverless, but pushes updates instead of polling.
3. **svelte-realtime**, if you want realtime push and you accept a Node host. Fastest to write of the three, and rooms give you the match, the players and the scoreboard as one thing.
4. **Socket.IO**, if you want the most battle-tested option and a large body of tutorials, and you accept the custom server.

If your app already runs on a Node or Bun host and you like writing Svelte, path 3 is the shortest route to a working duel. If you deploy to Vercel, path 1 or 2 is the only one that does not require a second service.

## Links

- Socket.IO, self-hosted: [socket.io](https://socket.io/docs/v4/) and the [Bun engine announcement](https://socket.io/blog/bun-engine/)
- svelte-realtime: [docs](https://svelte-realtime.dev/docs/architecture) and [repo](https://github.com/lanteanio/svelte-realtime)
- svelte-adapter-uws: [adapter docs](https://svelte-realtime.dev/docs/ecosystem/adapter/config)
- uWebSockets.js: [repo](https://github.com/uNetworking/uWebSockets.js)
- The classic SvelteKit WebSocket recipe with `ws`: [joyofcode](https://joyofcode.xyz/using-websockets-with-sveltekit), [mojoauth guide](https://mojoauth.com/dev-guides/create-a-websocket-server-with-sveltekit)
- The r/sveltejs thread where this question keeps coming up: [What's the recommended way to use WebSockets with SvelteKit?](https://www.reddit.com/r/sveltejs/comments/1n9kdw0/whats_the_recommended_way_to_use_websockets_with/)
