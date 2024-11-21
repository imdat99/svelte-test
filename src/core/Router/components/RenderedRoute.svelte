<script>
    import { setContext } from 'svelte';
    export let routeContext;
    export let match;
    // Set the context for the route
    setContext('RouteContext', routeContext);

    // Track how deep we got in our render pass to emulate SSR componentDidCatch
    // in a DataStaticRouter
    if (routeContext.static && routeContext.staticContext && (match.route.errorElement || match.route.ErrorBoundary)) {
        routeContext.staticContext._deepestRenderedBoundaryId = match.route.id;
    }
</script>

<slot />
