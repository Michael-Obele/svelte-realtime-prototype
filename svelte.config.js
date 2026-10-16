import adapter from 'svelte-adapter-uws';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			websocket: true
		})
	}
};

export default config;
