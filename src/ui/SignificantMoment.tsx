import { lazy, Suspense, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { animateSignificantMoment } from "./significant-moment-timeline";
import type { SignificantMoment as Moment } from "./significant-moments";
import "./significant-moments.css";

const Visual = lazy(() =>
  import("./SignificantMomentVisual").catch(() => ({ default: () => <></> })),
);
export type ActiveSignificantMoment = Moment & { serial: number };

/** A brief acknowledgement, never an action gate. All rules have already resolved. */
export function SignificantMoment({
  moment,
  paused = false,
  inline = false,
  dismiss,
}: {
  moment: ActiveSignificantMoment;
  paused?: boolean;
  inline?: boolean;
  dismiss: (serial: number) => void;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paused || !ref.current) return;
    const cleanup = animateSignificantMoment(ref.current, !!reduced);
    const timer = setTimeout(
      () => dismiss(moment.serial),
      reduced ? 2600 : 2300,
    );
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [moment.serial, paused, reduced, dismiss]);
  if (paused) return null;
  return (
    <div
      ref={ref}
      className={`significant-moment moment-${moment.kind}${inline ? " moment-inline" : ""}`}
      data-significant-moment={moment.kind}
      data-reduced-motion={!!reduced}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="moment-decoration" data-moment-emblem aria-hidden="true">
        {reduced ? (
          <svg viewBox="0 0 440 160" focusable="false">
            <path
              d="M208 28L220 13L232 28L220 43Z"
              fill="none"
              stroke="currentColor"
            />
            <path d="M110 128H330" stroke="currentColor" opacity=".5" />
          </svg>
        ) : moment.kind === "hero-fall" ? (
          <video
            src="/motion/hero-fall.webm"
            poster="/motion/hero-fall.png"
            muted
            autoPlay
            playsInline
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
          />
        ) : (
          <Suspense fallback={null}>
            <Visual
              kind={moment.kind}
              title={moment.title}
              subtitle={moment.subtitle}
            />
          </Suspense>
        )}
      </div>
      <div className="moment-copy" data-moment-title>
        <small>{moment.subtitle}</small>
        <strong>{moment.title}</strong>
      </div>
      <span className="moment-rule" data-moment-rule aria-hidden="true" />
    </div>
  );
}
