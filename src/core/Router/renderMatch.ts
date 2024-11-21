import { UNSAFE_invariant, type Router } from "@remix-run/router";
import type { DataRouteMatch, RouteMatch, RouteObject } from "./remix-router-svelte";
import type { SvelteComponent } from "svelte";
import RenderedRoute from "./components/RenderedRoute.svelte";

export function _renderMatches(
    matches: RouteMatch[] | null,
    parentMatches: RouteMatch[] = [],
    dataRouterState: Router["state"] | null = null,
    future: Router["future"] | null = null
  ): RouteMatch<string, RouteObject> | null {
    if (matches == null) {
      if (!dataRouterState) {
        return null;
      }
  
      if (dataRouterState.errors) {
        // Don't bail if we have data router errors so we can render them in the
        // boundary.  Use the pre-matched (or shimmed) matches
        matches = dataRouterState.matches as DataRouteMatch[];
      } else if (
        future?.v7_partialHydration &&
        parentMatches.length === 0 &&
        !dataRouterState.initialized &&
        dataRouterState.matches.length > 0
      ) {
        // Don't bail if we're initializing with partial hydration and we have
        // router matches.  That means we're actively running `patchRoutesOnNavigation`
        // so we should render down the partial matches to the appropriate
        // `HydrateFallback`.  We only do this if `parentMatches` is empty so it
        // only impacts the root matches for `RouterProvider` and no descendant
        // `<Routes>`
        matches = dataRouterState.matches as DataRouteMatch[];
      } else {
        return null;
      }
    }
  
    let renderedMatches = matches;
  
    // If we have data errors, trim matches to the highest error boundary
    let errors = dataRouterState?.errors;
    if (errors != null) {
      let errorIndex = renderedMatches.findIndex(
        (m) => m.route.id && errors?.[m.route.id] !== undefined
      );
      UNSAFE_invariant(
        errorIndex >= 0,
        `Could not find a matching route for errors on route IDs: ${Object.keys(
          errors
        ).join(",")}`
      );
      renderedMatches = renderedMatches.slice(
        0,
        Math.min(renderedMatches.length, errorIndex + 1)
      );
    }
  
    // If we're in a partial hydration mode, detect if we need to render down to
    // a given HydrateFallback while we load the rest of the hydration data
    let renderFallback = false;
    let fallbackIndex = -1;
    if (dataRouterState && future && future.v7_partialHydration) {
      for (let i = 0; i < renderedMatches.length; i++) {
        let match = renderedMatches[i];
        // Track the deepest fallback up until the first route without data
        if ((match.route as any).HydrateFallback || (match.route as any).hydrateFallbackElement) {
          fallbackIndex = i;
        }
  
        if (match.route.id) {
          let { loaderData, errors } = dataRouterState;
          let needsToRunLoader =
            match.route.loader &&
            loaderData[match.route.id] === undefined &&
            (!errors || errors[match.route.id] === undefined);
          if (match.route.lazy || needsToRunLoader) {
            // We found the first route that's not ready to render (waiting on
            // lazy, or has a loader that hasn't run yet).  Flag that we need to
            // render a fallback and render up until the appropriate fallback
            renderFallback = true;
            if (fallbackIndex >= 0) {
              renderedMatches = renderedMatches.slice(0, fallbackIndex + 1);
            } else {
              renderedMatches = [renderedMatches[0]];
            }
            break;
          }
        }
      }
    }
  
    return renderedMatches.reduceRight((outlet, match, index): any => {
      // Only data routers handle errors/fallbacks
      let error: any;
      let shouldRenderHydrateFallback = false;
      let errorElement: any = null;
      let hydrateFallbackElement: any = null;
      if (dataRouterState) {
        error = errors && match.route.id ? errors[match.route.id] : undefined;
        errorElement = (match.route as any).errorElement || "defaultErrorElement";
  
        if (renderFallback) {
          if (fallbackIndex < 0 && index === 0) {
            console.warn(
              "route-fallback",
              false,
              "No `HydrateFallback` element provided to render during initial hydration"
            );
            shouldRenderHydrateFallback = true;
            hydrateFallbackElement = null;
          } else if (fallbackIndex === index) {
            shouldRenderHydrateFallback = true;
            hydrateFallbackElement = (match.route as any).hydrateFallbackElement || null;
          }
        }
      }
  
      let matches = parentMatches.concat(renderedMatches.slice(0, index + 1));
      let getChildren: any = () => {
        let children: typeof SvelteComponent | null | null;
        if (error) {
          children = errorElement;
        } else if (shouldRenderHydrateFallback) {
          children = hydrateFallbackElement;
        } else if (match.route.element) {
          // Note: This is a de-optimized path since React won't re-use the
          // ReactElement since it's identity changes with each new
          // React.createElement call.  We keep this so folks can use
          // `<Route Component={...}>` in `<Routes>` but generally `Component`
          // usage is only advised in `RouterProvider` when we can convert it to
          // `element` ahead of time.
          children = match.route.element ;
        } else if (match.route.element) {
          children = match.route.element;
        } else {
          children = outlet as any;
        return {
          component: RenderedRoute,
          props: {
            match,
            routeContext: {
              outlet,
              matches,
              isDataRoute: dataRouterState != null,
            },
            children,
          },
        };
    };
      // Only wrap in an error boundary within data router usages when we have an
      // ErrorBoundary/errorElement on this route.  Otherwise let it bubble up to
      // an ancestor ErrorBoundary/errorElement
    return dataRouterState && ((match.route as any).ErrorBoundary || (match.route as any).errorElement || index === 0) ? 
    (
            JSON.stringify({
            location: dataRouterState.location,
            revalidation: dataRouterState.revalidation,
            component: errorElement,
            error,
            children: getChildren(),
            routeContext: { outlet: null, matches, isDataRoute: true },
            })
      ) : (
        getChildren()
      );
    }}, null);
}