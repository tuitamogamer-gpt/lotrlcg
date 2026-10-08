import { gsap } from "gsap";

/**
 * The finite Hyperframes ribbon timeline, played only after a significant game
 * state has already committed. Its decoration never dispatches a game action.
 */
export function animateSignificantMoment(
  element: HTMLElement,
  reduced: boolean,
): () => void {
  if (reduced) return () => {};

  const context = gsap.context(() => {
    const timeline = gsap.timeline({ paused: true });
    timeline
      .from(
        "[data-moment-emblem]",
        { opacity: 0, scale: 0.94, duration: 0.45, ease: "expo.out" },
        0.12,
      )
      .from(
        "[data-moment-title]",
        { opacity: 0, y: 7, duration: 0.38, ease: "power3.out" },
        0.2,
      )
      .from(
        "[data-moment-rule]",
        {
          opacity: 0,
          scaleX: 0,
          transformOrigin: "left center",
          duration: 0.36,
          ease: "sine.out",
        },
        0.3,
      )
      .to(
        "[data-moment-emblem]",
        { opacity: 0, scale: 0.98, duration: 0.22, ease: "power2.in" },
        1.72,
      )
      .to(
        "[data-moment-title]",
        { opacity: 0, y: -4, duration: 0.24, ease: "power3.in" },
        1.78,
      )
      .to(
        "[data-moment-rule]",
        { opacity: 0, duration: 0.22, ease: "sine.in" },
        1.78,
      );
    timeline.play();
  }, element);

  // Revert kills every scoped tween and removes the styles it introduced.
  // React StrictMode and interrupted moments can safely mount a fresh timeline.
  return () => context.revert();
}
