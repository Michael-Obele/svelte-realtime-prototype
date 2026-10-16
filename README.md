# svelte-realtime-prototype

Throwaway prototype. Its only job was to answer one question: **does [svelte-realtime](https://svelte-realtime.dev) actually work on Node with SvelteKit 2, in dev and in a production build?**

It is not production code. No auth, no tests, no error handling.

## What is in here

- `src/live/counter.ts` - one RPC function (`increment`) and one reactive stream (`counter`), copied from the library's own CLI template
- `src/hooks.ws.ts` - the WebSocket upgrade hook. This is the library's scaffolded default: it accepts every connection and gives it a random id
- `src/routes/+page.svelte` - the library's counter example page, plus `id` attributes so a test can assert on it
- `svelte.config.js` - `svelte-adapter-uws` with `websocket: true`
- `vite.config.ts` - the three required plugins: `sveltekit()`, `uws()`, `realtime()`, on port 5199
- `tsconfig.json` - extends the generated `.svelte-kit/tsconfig.json`, strict on

## Versions this was verified against

| Package | Version |
| --- | --- |
| Node | 24.22.0 (ABI 137) |
| Bun (package manager only) | 1.4.3 |
| @sveltejs/kit | 2.70.3 |
| vite | 8.3.4 |
| @sveltejs/vite-plugin-svelte | 7.3.1 |
| svelte | 5.57.2 |
| svelte-adapter-uws | 0.5.10 |
| svelte-realtime | 0.5.13 |
| uWebSockets.js | v20.71.0 |
| typescript | 7.0.2 |

## Run it

```sh
bun install
bun run dev      # http://localhost:5199
```

Production:

```sh
bun run build
node build       # http://localhost:3000
```

`vite preview` will not work for WebSockets. The library documents this: preview is Vite's own HTTP server and does not handle upgrades. Use `node build`.

### About vendor/uWebSockets.js

The docs say to install it as a git dependency (`uNetworking/uWebSockets.js#v20.60.0`). That fetched for over nine minutes here without completing, so `vendor/` holds a shallow clone instead and `package.json` points at it:

```sh
bun run vendor:uws
```

uWebSockets.js ships prebuilt binaries in the repo and its `package.json` has no install script, so nothing compiles. The binary that matters is chosen by Node's ABI: Node 24 is ABI 137, and `uws_linux_x64_137.node` is present in v20.71.0. Note the version the CLI pins (v20.60.0) predates Node 24 support.

## Verified results

Dev, in a browser, with a second tab open as the control:

- ✅ `[adapter-uws] Dev WebSocket endpoint at /ws` on startup
- ✅ the stream's initial value arrives over the WebSocket (the page goes from "Connecting..." to "Count: 0")
- ✅ the RPC reaches the server: clicking `+1` advanced the server-side count
- ✅ cross-client broadcast works: a second tab received every change
- ✅ `bun run build` succeeds (`Using adapter-uws ✔ done`, exit 0)

Two things worth knowing:

- ⚠️ A **hidden** document stops applying stream updates. With two tabs open, the visible tab tracked every change while the hidden one froze until it was brought forward. The browser reports `document.visibilityState` per tab, and in every run the frozen tab was exactly the `hidden` one. Worth knowing for a dashboard someone leaves in the background. (An earlier version of this file claimed the client that *sends* a mutation never sees its own update. That was wrong: the sending tab was simply the hidden one in those runs.)
- ✅ `bunx tsc --noEmit` exits clean, including the generated `$live/counter` types.
- ℹ️ `svelte-realtime` warns at startup when a live module has no `_guard`, because any authenticated WebSocket can then invoke every handler in it. `counter.ts` carries the library's documented `// realtime-allow-public` comment to declare itself intentionally open. A real app should use a `_guard` instead.

## Not tested here

- **SvelteKit 3.** `svelte-realtime` declares `@sveltejs/kit: ^2.0.0`, so Kit 2 is the supported path. Moving the adapter config from `svelte.config.js` into `vite.config.js` (`sv migrate sveltekit-3` has a `svelte-config` task for exactly this) is the obvious next experiment.
- **Bun as the runtime.** uWebSockets.js is a Node native addon, so the adapter is Node-side. Bun is used here only as the package manager.
- **Scaling.** One process, in-memory state. Multiple instances would need sticky sessions or a shared backend.
