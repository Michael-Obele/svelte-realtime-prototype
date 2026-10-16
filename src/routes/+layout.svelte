<script lang="ts">
    import "../app.css";
    import { browser } from "$app/environment";
    import { connect } from "svelte-adapter-uws/client";
    import { tabPlayerId } from "$lib/player-id";

    let { children } = $props();

    // Connect explicitly before any $live store subscribes, so the tab's
    // player id reaches upgrade() as ?player=. (connect() options are ignored
    // once the singleton exists, which is why this lives in the layout and
    // not in a page: layout script runs before any page mounts.)
    if (browser) {
        const id = tabPlayerId();
        if (id) {
            connect({ path: `/ws?player=${id}` });
        }
    }
</script>

{@render children()}
