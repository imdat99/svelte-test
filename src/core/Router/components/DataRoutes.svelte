<script>
  import { useRoutesImpl } from "../remix-router-svelte";

    export let routes;
    export let future;
    export let state;

    // import { useRoutesImpl } from './path-to-useRoutesImpl'; // Adjust the import path as needed
</script>

{#if routes && state && future}
    {@html useRoutesImpl(routes, undefined, state, future)}
{/if}
