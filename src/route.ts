import type { RouteObject } from "core/Router";
import Layout from "./Views/Components/Layout.svelte";
const routes: RouteObject[] = [
  {
    path: "/",
    element: Layout,
    children: [
      {
        index: true,
        lazy: async () => ({
          element: (await import("./Views/pages/Home.svelte")).default,
        })
      }
    ],
  },
];

export default routes;
