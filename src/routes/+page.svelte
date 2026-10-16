<script lang="ts">
	import { increment, counter } from '$live/counter';
</script>

<h1>svelte-realtime</h1>

{#if $counter === undefined}
	<p id="count">Connecting...</p>
{:else}
	<p id="count">Count: {$counter}</p>
{/if}

<button id="inc" onclick={() => increment()}>+1</button>
