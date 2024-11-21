import RouterProvider from 'core/Router/components/RouterProvider.svelte';
import routes from "route";
import { hydrate } from 'svelte';
import './app.css';
import { createBrowserRouter } from "./core/Router";
import { matchRoutes } from '@remix-run/router';
function createApp() {
  const router = createBrowserRouter(routes);

  // Provide a fallbackElement to be displayed during the initial data load;
  hydrate(RouterProvider, {
    target: document.getElementById("app")!,
    props: {
      router: router,
      fallbackElement: "<p>loading...</p>"
    }
  })
}
 // Determine if any of the initial routes are lazy
 const lazyMatches = matchRoutes(routes, window.location)?.filter(
  (m) => m.route.lazy
)
// Load the lazy matches and update the routes before creating your router
// so we can hydrate the SSR-rendered content synchronously

if (typeof window === 'object' && lazyMatches && lazyMatches?.length > 0) {
  Promise.all(
      lazyMatches.map(async (m) => {
          if (m.route.lazy) {
              const routeModule = await m.route.lazy()
              Object.assign(m.route, {
                  ...routeModule,
                  lazy: undefined,
              })
          }
      })
  ).then(createApp)
}
if (lazyMatches?.length === 0) {
  createApp()
}
