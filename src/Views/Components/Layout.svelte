<script>
  import Outlet from "../../core/Router/components/Outlet.svelte";


  </script>
  
  <!-- Render global-layout stuff here, such as a header and nav bar -->
  <h1>Welcome to my Svelte Application!</h1>
  <nav><!-- nav links --></nav>
  
  <!-- Render matching child routes via <Outlet /> -->
  <Outlet />