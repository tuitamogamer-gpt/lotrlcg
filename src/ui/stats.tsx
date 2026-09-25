import { useId } from "react";

type StatKind =
  "willpower" | "attack" | "defense" | "health" | "threat" | "progress";

const stats = {
  willpower: {
    label: "Willpower",
    short: "WILL",
    enamel: "#44545c",
    deep: "#17252e",
  },
  attack: { label: "Attack", short: "ATK", enamel: "#704337", deep: "#291c1b" },
  defense: {
    label: "Defense",
    short: "DEF",
    enamel: "#3d6678",
    deep: "#112a39",
  },
  health: {
    label: "Hit points",
    short: "HP",
    enamel: "#772a33",
    deep: "#300e19",
  },
  threat: { label: "Threat", short: "THR", enamel: "#76522b", deep: "#2b1b12" },
  progress: {
    label: "Progress",
    short: "PROG",
    enamel: "#42614c",
    deep: "#142e22",
  },
};

/** Original vector reliefs: brass bezels, enamel grounds, and engraved symbols.
 * Unique paint IDs also keep multiple card inspectors safe in Safari. */
export function StatIcon({ kind }: { kind: StatKind }) {
  const id = useId();
  const paint = (name: string) => `url(#${id}-${name})`;
  const palette = stats[kind];
  return (
    <svg
      className={`stat-emblem stat-emblem--${kind}`}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-brass`}
          x1="8"
          y1="2"
          x2="38"
          y2="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff0bd" />
          <stop offset=".24" stopColor="#c7a766" />
          <stop offset=".5" stopColor="#70502c" />
          <stop offset=".72" stopColor="#dfc38a" />
          <stop offset="1" stopColor="#73512c" />
        </linearGradient>
        <linearGradient
          id={`${id}-silver`}
          x1="14"
          y1="7"
          x2="33"
          y2="37"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fffdf0" />
          <stop offset=".43" stopColor="#dce4df" />
          <stop offset=".5" stopColor="#8babae" />
          <stop offset=".8" stopColor="#ebeee0" />
          <stop offset="1" stopColor="#8b9d9d" />
        </linearGradient>
        <radialGradient id={`${id}-enamel`} cx=".36" cy=".2" r=".85">
          <stop stopColor={palette.enamel} />
          <stop offset="1" stopColor={palette.deep} />
        </radialGradient>
        <linearGradient
          id={`${id}-ruby`}
          x1="16"
          y1="14"
          x2="31"
          y2="35"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffae9a" />
          <stop offset=".35" stopColor="#d74c55" />
          <stop offset=".65" stopColor="#a01e35" />
          <stop offset="1" stopColor="#540d24" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="25" r="22" fill="#080e0f" fillOpacity=".7" />
      <circle
        cx="24"
        cy="23"
        r="21"
        fill={paint("brass")}
        stroke="#322619"
        strokeWidth="1"
      />
      <circle
        cx="24"
        cy="23"
        r="18.3"
        fill={paint("enamel")}
        stroke="#251c16"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="23"
        r="16.6"
        stroke="#e0c28b"
        strokeOpacity=".4"
        strokeWidth=".6"
      />
      <path
        d="M8 19A17 17 0 0 1 19 7M29 39a17 17 0 0 0 11-12"
        stroke="#fff0bb"
        strokeOpacity=".55"
        strokeWidth=".8"
      />
      <path
        d="m24 2 2.5 3L24 8l-2.5-3Zm0 36 2.5 3-2.5 3-2.5-3ZM3 23l3-2 3 2-3 2Zm36 0 3-2 3 2-3 2Z"
        fill={paint("brass")}
        stroke="#5b4126"
        strokeWidth=".6"
      />
      <g strokeLinejoin="round" strokeLinecap="round">
        {kind === "willpower" && (
          <>
            <path
              d="M15 32c-3-10 2-20 18-23 1 13-5 23-15 22l-5 6Z"
              fill={paint("silver")}
              stroke="#13282e"
              strokeWidth="1.3"
            />
            <path
              d="M14 35 30 13M19 28l-1-8m6 1 7-3m-10 7 7-2m-5-5 1-5"
              stroke="#46636a"
              strokeWidth="1"
            />
            <path d="m17 29 11-15" stroke="#fffce4" strokeWidth="1" />
          </>
        )}
        {kind === "attack" && (
          <g transform="rotate(34 24 23)">
            <path
              d="m24 6 5 8-2.5 15h-5L19 14Z"
              fill={paint("silver")}
              stroke="#192529"
              strokeWidth="1.1"
            />
            <path d="M24 8v21" stroke="#fffdea" strokeWidth="1" />
            <path d="m24 9 3.5 6L25 27h-1Z" fill="#63858b" fillOpacity=".7" />
            <path
              d="M16 28q8-4 16 0l-1 3q-7-3-14 0Z"
              fill={paint("brass")}
              stroke="#372318"
              strokeWidth="1"
            />
            <path
              d="M22 30h4v8h-4Z"
              fill="#4d2923"
              stroke="#d0ac68"
              strokeWidth="1"
            />
            <path d="m22 33 4 2m-4 1 4 2" stroke="#caab75" strokeWidth=".8" />
            <path d="m24 38 3 2-3 3-3-3Z" fill={paint("brass")} />
          </g>
        )}
        {kind === "defense" && (
          <>
            <path
              d="m24 9 12 5-1 11c-.5 6-6 10-11 13-5-3-10.5-7-11-13l-1-11Z"
              fill={paint("brass")}
              stroke="#101f28"
              strokeWidth="1.2"
            />
            <path
              d="m24 12 9 4-.7 9c-.5 4-4.3 8-8.3 10-4-2-7.8-6-8.3-10l-.7-9Z"
              fill="#345b70"
              stroke="#efd39a"
              strokeWidth=".7"
            />
            <path d="m24 13 8 3-.7 9c-.4 4-4 7-7.3 9Z" fill="#132e44" />
            <path
              d="M24 15v16m-6-11h12m-6-5-3 4m3-4 3 4m-3 6-4 4m4-4 4 4"
              stroke={paint("silver")}
              strokeWidth="1.6"
            />
            <circle cx="24" cy="12" r="1" fill="#fff0bb" />
          </>
        )}
        {kind === "health" && (
          <>
            <path
              d="M24 17c-8-12-21 0-11 10l11 11 11-11c10-10-3-22-11-10Z"
              fill={paint("ruby")}
              stroke={paint("brass")}
              strokeWidth="1.6"
            />
            <path
              d="m24 18-6-3-5 6 11 14 11-14-5-6Z"
              stroke="#ffb1a0"
              strokeOpacity=".48"
              strokeWidth=".8"
            />
            <path d="m24 18-3 7 3 10 3-10Z" fill="#ff8f85" fillOpacity=".28" />
            <path d="M15 20c0-3 3-5 5-3" stroke="#ffe0c0" strokeWidth="1.5" />
          </>
        )}
        {kind === "threat" && (
          <>
            <path
              d="M8 23q16-19 32 0Q24 42 8 23Z"
              fill={paint("brass")}
              stroke="#27170f"
              strokeWidth="1.2"
            />
            <path d="M12 23q12-13 24 0-12 13-24 0Z" fill="#381b11" />
            <ellipse cx="24" cy="23" rx="7" ry="10" fill="#db8d32" />
            <path d="m24 13 3.5 10L24 33l-3.5-10Z" fill="#250f0c" />
            <path d="m24 15 1 8-1 7-1-7Z" fill="#ffe0a0" />
            <path d="M10 22q14-15 28 0" stroke="#ffdc91" strokeWidth=".8" />
          </>
        )}
        {kind === "progress" && (
          <>
            <path
              d="M24 10v25m0-17-6-5m6 9 9-7m-9 11-10-7m10 11 9-6m-9 8-6 3m6-3 6 3"
              stroke={paint("brass")}
              strokeWidth="2"
            />
            <path
              d="M24 16c-5-4-4-7 0-10 4 3 5 6 0 10ZM18 19c-6 0-8-4-7-8 5 0 8 3 7 8ZM29 21c-1-6 3-10 9-9 0 5-3 8-9 9ZM17 28c-6 0-8-3-8-7 5-1 8 2 8 7ZM30 30c-1-5 3-8 8-7-1 5-4 7-8 7Z"
              fill={paint("silver")}
              stroke="#1c4034"
              strokeWidth=".8"
            />
          </>
        )}
      </g>
    </svg>
  );
}

export function StatBadge({
  kind,
  value,
  label,
  damaged = false,
  caption = false,
}: {
  kind: StatKind;
  value: number | string | undefined;
  label?: string;
  damaged?: boolean;
  caption?: boolean;
}) {
  const description = `${label ?? stats[kind].label}: ${value ?? "—"}`;
  return (
    <span
      className={`stat-badge stat-badge--${kind}${damaged ? " is-damaged damaged" : ""}${caption ? " has-caption" : ""}`}
      role="img"
      aria-label={description}
      title={description}
    >
      <StatIcon kind={kind} />
      <span className="stat-reading" aria-hidden="true">
        <strong className="stat-value">{value ?? "—"}</strong>
        {caption && <small className="stat-caption">{stats[kind].short}</small>}
      </span>
    </span>
  );
}
