import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const snapshot = () =>
  typeof window === "undefined" ? true : window.matchMedia(query).matches;

function subscribe(changed: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener("change", changed);
  return () => preference.removeEventListener("change", changed);
}

/** Keep running decorations in sync when the system preference changes. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
