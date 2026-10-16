import { sveltekit } from '@sveltejs/kit/vite';
import uws from 'svelte-adapter-uws/vite';
import realtime from 'svelte-realtime/vite';

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit(), uws(), realtime()],
	server: {
		port: 5199
	}
};

export default config;
