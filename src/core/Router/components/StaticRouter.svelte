export interface StaticRouterProviderProps {
    context: StaticHandlerContext;
    router: RemixRouter;
    hydrate?: boolean;
    nonce?: string;
  }
  
  /**
   * A Data Router that may not navigate to any other location. This is useful
   * on the server where there is no stateful UI.
   */
  export function StaticRouterProvider({
    context,
    router,
    hydrate = true,
    nonce,
  }: StaticRouterProviderProps) {
    invariant(
      router && context,
      "You must provide `router` and `context` to <StaticRouterProvider>"
    );
  
    let dataRouterContext = {
      router,
      navigator: getStatelessNavigator(),
      static: true,
      staticContext: context,
      basename: context.basename || "/",
    };
  
    let fetchersContext = new Map();
  
    let hydrateScript = "";
  
    if (hydrate !== false) {
      let data = {
        loaderData: context.loaderData,
        actionData: context.actionData,
        errors: serializeErrors(context.errors),
      };
      // Use JSON.parse here instead of embedding a raw JS object here to speed
      // up parsing on the client.  Dual-stringify is needed to ensure all quotes
      // are properly escaped in the resulting string.  See:
      //   https://v8.dev/blog/cost-of-javascript-2019#json
      let json = htmlEscape(JSON.stringify(JSON.stringify(data)));
      hydrateScript = `window.__staticRouterHydrationData = JSON.parse(${json});`;
    }
  
    let { state } = dataRouterContext.router;
  
    return (
      <>
        <DataRouterContext.Provider value={dataRouterContext}>
          <DataRouterStateContext.Provider value={state}>
            <FetchersContext.Provider value={fetchersContext}>
              <ViewTransitionContext.Provider value={{ isTransitioning: false }}>
                <Router
                  basename={dataRouterContext.basename}
                  location={state.location}
                  navigationType={state.historyAction}
                  navigator={dataRouterContext.navigator}
                  static={dataRouterContext.static}
                  future={{
                    v7_relativeSplatPath: router.future.v7_relativeSplatPath,
                  }}
                >
                  <DataRoutes
                    routes={router.routes}
                    future={router.future}
                    state={state}
                  />
                </Router>
              </ViewTransitionContext.Provider>
            </FetchersContext.Provider>
          </DataRouterStateContext.Provider>
        </DataRouterContext.Provider>
        {hydrateScript ? (
          <script
            suppressHydrationWarning
            nonce={nonce}
            dangerouslySetInnerHTML={{ __html: hydrateScript }}
          />
        ) : null}
      </>
    );
  }
  

  
