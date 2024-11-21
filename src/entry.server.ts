import { createStaticHandler } from "@remix-run/router";
import { createStaticRouter } from "core/Router";
import { getRequestProtocol, readBody, type EventHandlerRequest, type H3Event } from "h3";
import routes from "route";
import { render } from "svelte/server";
import Home from "Views/pages/Home.svelte";
export async function renderApp(
  event: H3Event<EventHandlerRequest>,
  styles: string[],
  listScript: string[]
) {
  const { req } = event.node;
  const isLighthouse = req.headers['user-agent']?.includes('Chrome-Lighthouse') || req.headers['user-agent']?.includes('Google Page Speed Insights');
  const { query, dataRoutes } = createStaticHandler(routes, {
      future: {
          v7_throwAbortReason: true,
      },
  })

  const remixRequest = await createFetchRequest(event)
  const context = await query(remixRequest)
  if (context instanceof Response) {
      throw context
  }
  const router = createStaticRouter(dataRoutes, context);
  const routeKey = router.state.matches.at(-1)?.route.id || ''
  const loadedData = context.loaderData[routeKey] || {}
  console.log("context", context)
  return render(Home);
}

async function createFetchRequest(event: H3Event<EventHandlerRequest>): Promise<Request> {
  const protocol = getRequestProtocol(event);
  const req = event.node.req
  const origin = `${protocol}://${req.headers.host}`;

  const url = new URL(req.headers.origin || req.url!, origin)
  // const controller = new AbortController()
  // req.on('close', () => {
  //     try {
  //         controller.abort()
  //     } catch (error) {
  //         console.error(error)
  //     }
  // })

  const headers = new Headers()

  for (const [key, values] of Object.entries(req.headers)) {
      if (values) {
          if (Array.isArray(values)) {
              for (const value of values) {
                  headers.append(key, value)
              }
          } else {
              headers.set(key, values)
          }
      }
  }

  const init: RequestInit = {
      method: req.method,
      headers,
      // signal: controller.signal,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
      await readBody(event).then((body) => {
          init.body = body;
      })
  }

  return new Request(url.href, init)
}
