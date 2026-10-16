import { sveltekit } from '@sveltejs/kit/vite';
import uws from 'svelte-adapter-uws/vite';
import realtime from 'svelte-realtime/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), uws(), realtime()],
	server: {
		port: 5199
	}
});
