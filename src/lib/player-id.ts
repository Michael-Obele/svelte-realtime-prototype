import { browser } from '$app/environment';

const KEY = 'duel-player-id';
const RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Stable per-tab player id. sessionStorage survives reloads in the same tab
 * but is fresh in every new tab, so reloading keeps your seat while a second
 * tab still duels you as a second player. Falls back to a per-load id when
 * storage is unavailable (e.g. private mode) rather than crashing.
 */
export function tabPlayerId(): string | null {
	if (!browser) return null;
	try {
		const existing = sessionStorage.getItem(KEY);
		if (existing && RE.test(existing)) return existing;
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
