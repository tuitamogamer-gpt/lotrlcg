import { Player } from "@remotion/player";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

export type SignificantMomentKind =
  "stage" | "side-quest" | "hero-fall" | "victory" | "defeat";

export interface SignificantMomentVisualProps {
  kind: SignificantMomentKind;
  title: string;
  subtitle?: string;
}

export const SIGNIFICANT_MOMENT_FPS = 30;
export const SIGNIFICANT_MOMENT_FRAMES = 60;
export const SIGNIFICANT_MOMENT_WIDTH = 440;
export const SIGNIFICANT_MOMENT_HEIGHT = 160;

const colors: Record<SignificantMomentKind, string> = {
  stage: "#cbb486",
  "side-quest": "#bcb98f",
  "hero-fall": "#b98c78",
  victory: "#e2c88c",
  defeat: "#ab8d88",
};
const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Decorative only. Game text remains HTML in the surrounding live region. */
export function SignificantMomentComposition({
  kind,
}: SignificantMomentVisualProps) {
  const frame = useCurrentFrame();
  const color = colors[kind];
  const fall = kind === "hero-fall" || kind === "defeat";
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        pointerEvents: "none",
        opacity: interpolate(frame, [0, 8, 43, 59], [0, 1, 1, 0], clamp),
      }}
    >
      <svg
        viewBox="0 0 440 160"
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="lotr-moment-light">
            <stop offset="0" stopColor={color} stopOpacity="0" />
            <stop offset="0.28" stopColor={color} stopOpacity="0.55" />
            <stop offset="0.5" stopColor={color} stopOpacity="0.9" />
            <stop offset="0.72" stopColor={color} stopOpacity="0.55" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <radialGradient id="lotr-moment-glow">
            <stop offset="0" stopColor={color} stopOpacity="0.11" />
            <stop offset="0.5" stopColor={color} stopOpacity="0.035" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx="220"
          cy="70"
          rx="178"
          ry="68"
          fill="url(#lotr-moment-glow)"
          style={{
            scale: interpolate(frame, [0, 26, 59], [0.82, 1, 1.05], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            transformOrigin: "220px 70px",
          }}
        />
        <path
          d="M34 52H170L185 46L196 52M244 52L255 46L270 52H406"
          fill="none"
          stroke="url(#lotr-moment-light)"
          strokeWidth="0.85"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [2, 24], [1, 0], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
        <path
          d="M47 57H170L185 63L197 57M243 57L255 63L270 57H393"
          fill="none"
          stroke="url(#lotr-moment-light)"
          strokeWidth="0.65"
          opacity="0.6"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [6, 28], [1, 0], clamp)}
        />
        <g
          fill="none"
          stroke={color}
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            opacity: interpolate(frame, [0, 12], [0, 0.85], clamp),
            translate: interpolate(
              frame,
              [0, 22, 59],
              ["0px 4px", "0px 0px", fall ? "0px 3px" : "0px -1px"],
              { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) },
            ),
          }}
        >
          <path
            d="M220 29L244 53L220 77L196 53Z"
            opacity="0.5"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={interpolate(frame, [4, 25], [1, 0], clamp)}
          />
          {kind === "stage" && (
            <path d="M220 39V65M210 45L220 39L230 45M211 60L220 65L229 60" />
          )}
          {kind === "side-quest" && (
            <path d="M220 39L229 53L220 67L211 53ZM211 53H229M220 44V62" />
          )}
          {kind === "victory" && (
            <path d="M207 47L211 60H229L233 47L225 53L220 41L215 53ZM213 64H227" />
          )}
          {kind === "hero-fall" && (
            <path d="M213 41L219 51M224 54L231 65M210 61L214 57M226 45L230 41M208 64L212 60M227 42L233 36" />
          )}
          {kind === "defeat" && (
            <path d="M211 42L217 49M223 56L229 64M229 42L223 49M217 56L211 64M218 51L222 55" />
          )}
        </g>
        <g fill={color}>
          {[92, 151, 289, 348].map((x, index) => (
            <circle
              key={x}
              cx={x}
              cy={53 + (index % 2 ? 6 : -5)}
              r="1.05"
              style={{
                opacity: interpolate(
                  frame,
                  [8 + index * 2, 20 + index * 2, 38, 54],
                  [0, 0.55, 0.45, 0],
                  clamp,
                ),
                translate: interpolate(
                  frame,
                  [4, 59],
                  ["0px 0px", `0px ${fall ? 7 : -5}px`],
                  clamp,
                ),
              }}
            />
          ))}
        </g>
      </svg>
    </AbsoluteFill>
  );
}

/** Parent lazy-loads this chunk only for a significant, permitted motion event. */
export default function SignificantMomentVisual(
  props: SignificantMomentVisualProps,
) {
  return (
    <div
      aria-hidden="true"
      inert
      data-significant-moment-visual={props.kind}
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <Player
        component={SignificantMomentComposition}
        inputProps={props}
        durationInFrames={SIGNIFICANT_MOMENT_FRAMES}
        compositionWidth={SIGNIFICANT_MOMENT_WIDTH}
        compositionHeight={SIGNIFICANT_MOMENT_HEIGHT}
        fps={SIGNIFICANT_MOMENT_FPS}
        autoPlay
        loop={false}
        initiallyMuted
        numberOfSharedAudioTags={0}
        controls={false}
        allowFullscreen={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        browserMediaControlsBehavior={{ mode: "do-nothing" }}
        errorFallback={() => null}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}
