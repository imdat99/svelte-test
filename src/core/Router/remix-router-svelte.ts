import {
  Action as NavigationType,
  resolveTo,
  type Fetcher,
  type FormEncType,
  type FormMethod,
  type Navigation,
  type Router,
  type Location,
  type HydrationState,
  createRouter,
  createMemoryHistory,
  type AgnosticRouteObject,
  type AgnosticRouteMatch,
  createBrowserHistory,
  createHashHistory,
  type StaticHandlerContext,
  type FutureConfig as RouterFutureConfig,
  type UNSAFE_RouteManifest as RouteManifest,
  UNSAFE_convertRoutesToDataRoutes as convertRoutesToDataRoutes,
  type AgnosticDataRouteObject,
  Action,
  IDLE_NAVIGATION,
  type RevalidationState,
  type To,
  createPath,
  type Path,
  IDLE_FETCHER,
  IDLE_BLOCKER,
  isRouteErrorResponse,
  matchRoutes,
  UNSAFE_invariant,
  parsePath,
} from "@remix-run/router";
import { onDestroy, type SvelteComponent } from "svelte";
import { derived, get, writable, type Readable } from "svelte/store";
import { getRouteContext, getRouterContext } from "./contexts";
import { getFormSubmissionInfo, type SubmitOptions } from "./dom";

// Create svelte-specific types from the agnostic types in @remix-run/router to
// export from remix-router-svelte
export interface RouteObject extends Omit<AgnosticRouteObject, 'children' | 'index'> {
  children?: RouteObject[];
  element?: typeof SvelteComponent | null;
  // TODO: Not yet implemented
  // errorElement?: typeof SvelteComponent | null;
  hasErrorBoundary?: boolean;
}

export interface DataRouteObject extends RouteObject {
  children?: DataRouteObject[];
  id: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RouteMatch<
  ParamKey extends string = string,
  RouteObjectType extends RouteObject = RouteObject
> extends AgnosticRouteMatch<ParamKey, RouteObjectType> {
    match: any;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DataRouteMatch extends RouteMatch<string, DataRouteObject> {}

interface CreateRouterOpts {
  basename?: string;
  hydrationData?: HydrationState;
}

interface CreateMemoryRouterOpts extends CreateRouterOpts {
  initialEntries?: string[];
  initialIndex?: number;
}

interface CreateBrowserRouterOpts extends CreateRouterOpts {
  window?: Window;
}

interface CreateHashRouterOpts extends CreateRouterOpts {
  window?: Window;
}

export function createMemoryRouter(
  routes: RouteObject[],
  {
    basename,
    hydrationData,
    initialEntries,
    initialIndex,
  }: CreateMemoryRouterOpts = {}
) {
  return createRouter({
    basename,
    history: createMemoryHistory({
      initialEntries,
      initialIndex,
    }),
    hydrationData,
    routes: enhanceManualRouteObjects(routes),
  }).initialize();
}

export function createBrowserRouter(
  routes: RouteObject[],
  { basename, hydrationData, window }: CreateBrowserRouterOpts = {}
) {
  return createRouter({
    basename,
    history: createBrowserHistory({ window }),
    hydrationData,
    routes: enhanceManualRouteObjects(routes),
  }).initialize();
}

export function createHashRouter(
  routes: RouteObject[],
  { basename, hydrationData, window }: CreateHashRouterOpts = {}
) {
  return createRouter({
    basename,
    history: createHashHistory({ window }),
    hydrationData,
    routes: enhanceManualRouteObjects(routes),
  }).initialize();
}
//#endregion

type FetcherWithComponents<TData> = Fetcher<TData> & {
  Form: any;
  // TODO: abstract via useSubmitImpl
  submit(target: SubmitTarget, options?: SubmitOptions): void;
  load: (href: string) => void;
};

type SubmitTarget =
  | HTMLFormElement
  | HTMLButtonElement
  | HTMLInputElement
  | FormData
  | URLSearchParams
  | { [name: string]: string }
  | null;

export function useLoaderData() {
  let ctx = getRouteContext();
  return useRouteLoaderData(ctx.id);
}

export function useRouteLoaderData(routeId: string) {
  let ctx = getRouterContext();
  return derived(ctx.state, ({ loaderData }, set) => {
    // this guard protects against returning undefined due to differences in the Svelte and Vue reactivity models.
    // I want to understand this more
    if (loaderData[routeId]) {
      set(loaderData[routeId]);
    }
  });
}

export function useLocation(): Readable<Location> {
  let ctx = getRouterContext();
  return derived(ctx.state, ({ location }) => location);
}

export function useNavigation(): Readable<Navigation> {
  let ctx = getRouterContext();
  return derived(ctx.state, ({ navigation }) => navigation);
}

export function useNavigate(): Router["navigate"] {
  let ctx = getRouterContext();
  return ctx.router.navigate;
}

export function useNavigationType(): Readable<NavigationType> {
  let ctx = getRouterContext();
  return derived(ctx.state, ({ historyAction }) => historyAction);
}

export function useMatches() {
  let ctx = getRouterContext();

  return derived(ctx.state, ({ matches, loaderData }) =>
    matches.map((match) => ({
      id: match.route.id,
      pathname: match.pathname,
      params: match.params,
      data: loaderData[match.route.id] as unknown,
      handle: match.route.handle as unknown,
    }))
  );
}

export function useFormAction(action = "."): string {
  let { router } = getRouterContext();
  let route = getRouteContext();
  let location = useLocation();
  let { pathname } = get(location);

  let path = resolveTo(
    action,
    router.state.matches.map((match) => match.pathnameBase),
    pathname
  );

  let search = path.search;
  if (action === "." && route.index) {
    search = search ? search.replace(/^\?/, "?index&") : "?index";
  }

  return path.pathname + search;
}

let fetcherId = 0;
export function useFetcher<TData = unknown>(): Readable<
  FetcherWithComponents<TData>
> {
  let { router, state } = getRouterContext();
  let routeId = getRouteContext().id;
  let defaultAction = useFormAction();
  let fetcherKey = String(++fetcherId);
  let fetcherStore = writable<Fetcher<TData>>(
    router.getFetcher<TData>(fetcherKey)
  );
  let unsub = state.subscribe(() => {
    fetcherStore.set(router.getFetcher<TData>(fetcherKey));
  });

  class FetcherForm extends Form {
    constructor(config: { props: Record<string, unknown>; target: Element }) {
      config.props = { ...config.props, fetcherKey };
      super(config);
    }
  }

  onDestroy(() => {
    router.deleteFetcher(fetcherKey);
    unsub();
  });

  return derived(fetcherStore, (fetcher) => {
    return {
      ...fetcher,
      Form: FetcherForm,
      submit(target: SubmitTarget, options = {}) {
        return submitForm(
          router,
          defaultAction,
          target,
          options,
          fetcherKey,
          routeId
        );
      },
      load(href: string) {
        return router.fetch(fetcherKey, routeId, href);
      },
    };
  });
}

export { default as RouterProvider } from "./components/RouterProvider.svelte";
export { default as Outlet } from "./components/Outlet.svelte";
export { default as Link } from "./components/Link.svelte";
import { default as Form } from "./components/Form.svelte";
import type { MapRoutePropertiesFunction } from "@remix-run/router/dist/utils";
import { useLocationContext } from "./context";
import { _renderMatches } from "./renderMatch";
export { Form };
export { shouldProcessLinkClick } from "./dom";
export { getRouteContext, getRouterContext } from "./contexts";

export { json, redirect, isRouteErrorResponse } from "@remix-run/router";

/// utils
export function submitForm(
  router: Router,
  defaultAction: string,
  target: SubmitTarget,
  options: SubmitOptions = {},
  fetcherKey?: string,
  routeId?: string
): void {
  if (typeof document === "undefined") {
    throw new Error("Unable to submit during server render");
  }

  let { method, encType, formData, url } = getFormSubmissionInfo(
    target,
    defaultAction,
    options
  );

  let href = url.pathname + url.search;
  let opts = {
    replace: options.replace,
    formData,
    formMethod: method as FormMethod,
    formEncType: encType as FormEncType,
  } as any;
  if (fetcherKey) {
    router.fetch(fetcherKey, String(routeId), href, opts);
  } else {
    router.navigate(href, opts);
  }
}

function enhanceManualRouteObjects(routes: RouteObject[]): AgnosticRouteObject[] {
  return routes.map((route) => {
    let routeClone = { ...route };
    if (routeClone.hasErrorBoundary == null) {
      // TODO: Wire up once errorElement is added
      // routeClone.hasErrorBoundary = routeClone.errorElement != null;
      routeClone.hasErrorBoundary = false;
    }
    if (routeClone.children) {
      routeClone.children = enhanceManualRouteObjects(routeClone.children);
    }
    return routeClone as any
  });
}
export function createStaticRouter(
  routes: RouteObject[],
  context: StaticHandlerContext,
  opts: {
    // Only accept future flags that impact the server render
    future?: Partial<
      Pick<RouterFutureConfig, "v7_partialHydration" | "v7_relativeSplatPath">
    >;
  } = {}
): Router {
  let manifest: RouteManifest = {};
  let dataRoutes = convertRoutesToDataRoutes(
    routes,
    mapRouteProperties,
    undefined,
    manifest
  );

  // Because our context matches may be from a framework-agnostic set of
  // routes passed to createStaticHandler(), we update them here with our
  // newly created/enhanced data routes
  let matches = context.matches.map((match) => {
    let route = manifest[match.route.id] || match.route;
    return {
      ...match,
      route,
    };
  });

  let msg = (method: string) =>
    `You cannot use router.${method}() on the server because it is a stateless environment`;

  return {
    get basename() {
      return context.basename;
    },
    get future() {
      return {
        v7_fetcherPersist: false,
        v7_normalizeFormMethod: false,
        v7_partialHydration: opts.future?.v7_partialHydration === true,
        v7_prependBasename: false,
        v7_relativeSplatPath: opts.future?.v7_relativeSplatPath === true,
        v7_skipActionErrorRevalidation: false,
      };
    },
    get state() {
      return {
        historyAction: Action.Pop,
        location: context.location,
        matches,
        loaderData: context.loaderData,
        actionData: context.actionData,
        errors: context.errors,
        initialized: true,
        navigation: IDLE_NAVIGATION,
        restoreScrollPosition: null,
        preventScrollReset: false,
        revalidation: "idle" as RevalidationState,
        fetchers: new Map(),
        blockers: new Map(),
      };
    },
    get routes() {
      return dataRoutes;
    },
    get window() {
      return undefined;
    },
    initialize() {
      throw msg("initialize");
    },
    subscribe() {
      throw msg("subscribe");
    },
    enableScrollRestoration() {
      throw msg("enableScrollRestoration");
    },
    navigate() {
      throw msg("navigate");
    },
    fetch() {
      throw msg("fetch");
    },
    revalidate() {
      throw msg("revalidate");
    },
    createHref,
    encodeLocation,
    getFetcher() {
      return IDLE_FETCHER;
    },
    deleteFetcher() {
      throw msg("deleteFetcher");
    },
    dispose() {
      throw msg("dispose");
    },
    getBlocker() {
      return IDLE_BLOCKER;
    },
    deleteBlocker() {
      throw msg("deleteBlocker");
    },
    patchRoutes() {
      throw msg("patchRoutes");
    },
    _internalFetchControllers: new Map(),
    _internalActiveDeferreds: new Map(),
    _internalSetRoutes() {
      throw msg("_internalSetRoutes");
    },
  };
}
const ABSOLUTE_URL_REGEX = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
function encodeLocation(to: To): Path {
  let href = typeof to === "string" ? to : createPath(to);
  // Treating this as a full URL will strip any trailing spaces so we need to
  // pre-encode them since they might be part of a matching splat param from
  // an ancestor route
  href = href.replace(/ $/, "%20");
  let encoded = ABSOLUTE_URL_REGEX.test(href)
    ? new URL(href)
    : new URL(href, "http://localhost");
  return {
    pathname: encoded.pathname,
    search: encoded.search,
    hash: encoded.hash,
  };
}
function createHref(to: To) {
  return typeof to === "string" ? to : createPath(to);
}
const mapRouteProperties: MapRoutePropertiesFunction = (route) => {
  let updates: Partial<AgnosticDataRouteObject> & { hasErrorBoundary: boolean } = {
    // Note: this check also occurs in createRoutesFromChildren so update
    // there if you change this -- please and thank you!
    hasErrorBoundary: route.hasErrorBoundary != null,
  };

/*  if (route.handle) {
    // if (__DEV__) {
    //   if (route.element) {
    //     warning(
    //       false,
    //       "You should not include both `Component` and `element` on your route - " +
    //         "`Component` will be used."
    //     );
    //   }
    // }
    Object.assign(updates, {
      element: React.createElement(route.Component),
      Component: undefined,
    });
  }

  if (route.HydrateFallback) {
    if (__DEV__) {
      if (route.hydrateFallbackElement) {
        warning(
          false,
          "You should not include both `HydrateFallback` and `hydrateFallbackElement` on your route - " +
            "`HydrateFallback` will be used."
        );
      }
    }
    Object.assign(updates, {
      hydrateFallbackElement: React.createElement(route.HydrateFallback),
      HydrateFallback: undefined,
    });
  }

  if (route.ErrorBoundary) {
    if (__DEV__) {
      if (route.errorElement) {
        warning(
          false,
          "You should not include both `ErrorBoundary` and `errorElement` on your route - " +
            "`ErrorBoundary` will be used."
        );
      }
    }
    Object.assign(updates, {
      errorElement: React.createElement(route.ErrorBoundary),
      ErrorBoundary: undefined,
    });
  }*/

  return updates;
}
export function serializeErrors(
  errors: StaticHandlerContext["errors"]
): StaticHandlerContext["errors"] {
  if (!errors) return null;
  let entries = Object.entries(errors);
  let serialized: StaticHandlerContext["errors"] = {};
  for (let [key, val] of entries) {
    // Hey you!  If you change this, please change the corresponding logic in
    // deserializeErrors in react-router-dom/index.tsx :)
    if (isRouteErrorResponse(val)) {
      serialized[key] = { ...val, __type: "RouteErrorResponse" };
    } else if (val instanceof Error) {
      // Do not serialize stack traces from SSR for security reasons
      serialized[key] = {
        message: val.message,
        __type: "Error",
        // If this is a subclass (i.e., ReferenceError), send up the type so we
        // can re-create the same type during hydration.
        ...(val.name !== "Error"
          ? {
              __subType: val.name,
            }
          : {}),
      };
    } else {
      serialized[key] = val;
    }
  }
  return serialized;
}
  // Helper function for matching routes
  export function useRoutesImpl(
    routes: RouteObject[],
    locationArg?: Partial<Location> | string,
    dataRouterState?: RemixRouter["state"],
    future?: RemixRouter["future"]
  ): React.ReactElement | null {
    UNSAFE_invariant(
      useInRouterContext(),
      // TODO: This error is probably because they somehow have 2 versions of the
      // router loaded. We can help them understand how to avoid that.
      `useRoutes() may be used only in the context of a <Router> component.`
    );
  
    let { navigator } = React.useContext(NavigationContext);
    let { matches: parentMatches } = React.useContext(RouteContext);
    let routeMatch = parentMatches[parentMatches.length - 1];
    let parentParams = routeMatch ? routeMatch.params : {};
    let parentPathnameBase = routeMatch ? routeMatch.pathnameBase : "/";
  
    let locationFromContext = useLocation();
  
    let location;
    if (locationArg) {
      let parsedLocationArg =
        typeof locationArg === "string" ? parsePath(locationArg) : locationArg;
  
      UNSAFE_invariant(
        parentPathnameBase === "/" ||
          parsedLocationArg.pathname?.startsWith(parentPathnameBase),
        `When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, ` +
          `the location pathname must begin with the portion of the URL pathname that was ` +
          `matched by all parent routes. The current pathname base is "${parentPathnameBase}" ` +
          `but pathname "${parsedLocationArg.pathname}" was given in the \`location\` prop.`
      );
  
      location = parsedLocationArg;
    } else {
      location = locationFromContext;
    }
  
    let pathname = location.pathname || "/";
  
    let remainingPathname = pathname;
    if (parentPathnameBase !== "/") {
      // Determine the remaining pathname by removing the # of URL segments the
      // parentPathnameBase has, instead of removing based on character count.
      // This is because we can't guarantee that incoming/outgoing encodings/
      // decodings will match exactly.
      // We decode paths before matching on a per-segment basis with
      // decodeURIComponent(), but we re-encode pathnames via `new URL()` so they
      // match what `window.location.pathname` would reflect.  Those don't 100%
      // align when it comes to encoded URI characters such as % and &.
      //
      // So we may end up with:
      //   pathname:           "/descendant/a%25b/match"
      //   parentPathnameBase: "/descendant/a%b"
      //
      // And the direct substring removal approach won't work :/
      let parentSegments = parentPathnameBase.replace(/^\//, "").split("/");
      let segments = pathname.replace(/^\//, "").split("/");
      remainingPathname = "/" + segments.slice(parentSegments.length).join("/");
    }
  
    let matches = matchRoutes(routes, { pathname: remainingPathname });
  
    let renderedMatches = _renderMatches(
      matches &&
        matches.map((match) =>
          Object.assign({}, match, {
            params: Object.assign({}, parentParams, match.params),
            pathname: joinPaths([
              parentPathnameBase,
              // Re-encode pathnames that were decoded inside matchRoutes
              navigator.encodeLocation
                ? navigator.encodeLocation(match.pathname).pathname
                : match.pathname,
            ]),
            pathnameBase:
              match.pathnameBase === "/"
                ? parentPathnameBase
                : joinPaths([
                    parentPathnameBase,
                    // Re-encode pathnames that were decoded inside matchRoutes
                    navigator.encodeLocation
                      ? navigator.encodeLocation(match.pathnameBase).pathname
                      : match.pathnameBase,
                  ]),
          })
        ),
      parentMatches,
      dataRouterState,
      future
    );
  
    // When a user passes in a `locationArg`, the associated routes need to
    // be wrapped in a new `LocationContext.Provider` in order for `useLocation`
    // to use the scoped location instead of the global location.
    if (locationArg && renderedMatches) {
      return (
        <LocationContext.Provider
          value={{
            location: {
              pathname: "/",
              search: "",
              hash: "",
              state: null,
              key: "default",
              ...location,
            },
            navigationType: NavigationType.Pop,
          }}
        >
          {renderedMatches}
        </LocationContext.Provider>
      );
    }
  
    return renderedMatches;
  }
