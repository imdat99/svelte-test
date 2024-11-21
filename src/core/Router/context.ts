import { writable, get } from "svelte/store";
import { setContext, getContext } from "svelte";
import type { Action, Location } from "@remix-run/router";
interface LocationContextObject {
  location: Location;
  navigationType: Action;
}
// Interface-like structure
export const createLocationContext = (initialValue: LocationContextObject) => {
  const location = writable(initialValue.location);
  const navigationType = writable(initialValue.navigationType);

  // Public API for context
  return { location, navigationType };
};

// Helper to provide context
export function provideLocationContext(contextObject: LocationContextObject) {
  setContext("locationContext", contextObject);
}

// Helper to consume context
export function useLocationContext() {
  const context = getContext("locationContext");
  if (!context) {
    throw new Error(
      "useLocationContext must be used within a LocationContext provider."
    );
  }
  return context as LocationContextObject;
}