import { useEffect } from 'react';

let hydrated = false;

/** Call once in the root component: marks the app as running in the browser. */
export function useMarkHydrated(): void {
  useEffect(() => {
    hydrated = true;
  }, []);
}

/**
 * False during the server render and the hydration render, true for components that mount
 * later. Entrance animations use it so server-rendered content is never hidden at opacity 0
 * while JavaScript loads; they play only on navigations inside the app.
 */
export function wasHydratedBeforeMount(): boolean {
  return hydrated;
}
