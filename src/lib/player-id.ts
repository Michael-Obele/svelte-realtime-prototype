import { browser } from "$app/environment";

const KEY = "duel-player-id";

/**
 * Stable per-tab player id. sessionStorage survives reloads in the same tab
 * but is fresh in every new tab, so reloading keeps your seat while a second
 * tab still duels you as a second player. Unvalidated here: upgrade()
 * re-validates and mints a random id for junk.
 */
export function tabPlayerId(): string | null {
  if (!browser) return null;
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Must match displayName() in src/live/duel.ts. */
export function shortName(id: string): string {
  return `Guest-${id.slice(0, 4)}`;
}
