// PROTOTYPE: this is the library's scaffolded upgrade() hook. It accepts every
// WebSocket connection and gives it a random id. There is no auth here on
// purpose (throwaway prototype). Replace before anything real.
import { message } from "svelte-realtime/server";

export { message };

const PLAYER_RE = /^[A-Za-z0-9_-]{8,64}$/;

function playerIdFromUrl(url: string): string | null {
  const query = url.indexOf("?");
  if (query === -1) return null;
  const player = new URLSearchParams(url.slice(query + 1)).get("player");
  return player && PLAYER_RE.test(player) ? player : null;
}

export function upgrade({ url }: { url: string }) {
  // Prefer the tab-stable id the layout sends as ?player=. A reload then
  // rejoins under the same id (the 5s presence grace absorbs the blip),
  // while a new tab mints a new id and shows up as a second player.
  // Connections without one (e.g. the counter page on an old tab) keep the
  // previous behaviour: a fresh random id.
  const id = (url && playerIdFromUrl(url)) || crypto.randomUUID();
  return { id, name: id.slice(0, 4) };
}
