<script>
  import routes from "route";
  import { createBrowserRouter } from "./core/Router";
  import RouterProvider from "./core/Router/components/RouterProvider.svelte";

  // Define your routes in a nested array, providing loaders and actions where
  // appropriate
 

  // Create a router from your routes
  const router = createBrowserRouter(routes);

  // Provide a fallbackElement to be displayed during the initial data load
  const fallbackElement = "<p>loading...</p>";
  // or const fallbackElement = MySvelteComponent
</script>

<RouterProvider {router} {fallbackElement} />