// realtime-allow-public - declared intentionally open for this demo. A real app
// should use a _guard instead (see the startup warning).
import { live } from 'svelte-realtime/server';

let count = 0;

export const increment = live((ctx) => {
	count++;
	ctx.publish('count', 'set', count);
	return count;
});

export const counter = live.stream(
	'count',
	() => {
		return count;
	},
	{ merge: 'set' }
);
