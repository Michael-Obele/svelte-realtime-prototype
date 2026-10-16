// PROTOTYPE: this is the library's scaffolded upgrade() hook. It accepts every
// WebSocket connection and gives it a random id. There is no auth here on
// purpose (throwaway prototype). Replace before anything real.
import { message } from 'svelte-realtime/server';

export { message };

export function upgrade() {
	return { id: crypto.randomUUID() };
}
