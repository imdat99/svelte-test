import { createBrowserRouter, RouterProvider } from 'core/Router';
import routes from 'route';
import { mount } from 'svelte';
import './app.css';
const router = createBrowserRouter(routes);

const fallbackElement = "<p>loading...</p>";
const app = mount(RouterProvider, {
  target: document.getElementById('app')!,
  props: {
    router,
    fallbackElement
  }
})

export default app
