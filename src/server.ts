import 'isomorphic-fetch'
import fs from 'fs/promises'
import { createServer } from 'http';
// import { createClient } from 'redis';
import {
  createApp,
  eventHandler,
  fromNodeMiddleware,
  setResponseHeader,
  toNodeListener
} from 'h3';
import type { ViteDevServer } from 'vite';
type RenderApp = typeof import('./entry.server').renderApp
// Constants
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : ''

// Create http server
const app = createApp();

// Add Vite or respective production middlewares
let vite: ViteDevServer
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base,
  })
  app.use(fromNodeMiddleware(vite.middlewares))
} else {
  // const compression = (await import('compression')).default
}

// Serve HTML
/*app.use('*all', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')

    let template
    let render
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    const rendered = await render(url)

    const html = template
      .replace(`<!--app-head-->`, rendered.head ?? '')
      .replace(`<!--app-html-->`, rendered.body ?? '')

    res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})*/
app.use(eventHandler(async (event) => {
  try {
    const url = event.node.req.originalUrl || '/'
    let template
    let render: RenderApp;
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry.server.ts')).renderApp
    } else {
      template = templateHtml
      //@ts-ignore
      render = (await import('./dist/server/entry.server.js')).renderApp
    }
    const rendered = await render(event, [], []);
    const html = template
      .replace(`<!--app-head-->`, rendered.head ?? '')
      .replace(`<!--app-html-->`, rendered.body ?? '')
    
    event.node.res.statusCode = 200
    setResponseHeader(event, 'content-type', 'text/html');
    event.node.res.end(html)
  }
  catch (err) {
    const e = err as Error
    vite.ssrFixStacktrace(e)
    console.log(e.stack)
    event.node.res.statusCode = 500
    event.node.res.end(e.stack)
  }
}))


// Start http server
const server = createServer(toNodeListener(app));
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});