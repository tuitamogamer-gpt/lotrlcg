import type { GameState } from "../game/types";
import type {
  SignificantMoment,
  SignificantMomentKind,
} from "./significant-moments";

export const AUDIO_KEY = "there-and-back-again.audio.v1";
const SEEN_KEY = "there-and-back-again.audio-events.v1";
const SEEN_LIMIT = 512;
export const AUDIO_CUES: Record<SignificantMomentKind, string> = {
  stage: "/audio/quest-advance.mp3",
  "side-quest": "/audio/side-quest.mp3",
  "hero-fall": "/audio/hero-fall.mp3",
  victory: "/audio/victory.mp3",
  defeat: "/audio/defeat.mp3",
};
export interface AudioPreferences {
  muted: boolean;
  volume: number;
}
export const DEFAULT_AUDIO: AudioPreferences = { muted: false, volume: 0.3 };
export function parseAudioPreferences(raw: string | null): AudioPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    return {
      muted:
        typeof value?.muted === "boolean" ? value.muted : DEFAULT_AUDIO.muted,
      volume:
        typeof value?.volume === "number" && Number.isFinite(value.volume)
          ? Math.max(0, Math.min(1, value.volume))
          : DEFAULT_AUDIO.volume,
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

/** Logical state survives undo/reload; transient ribbon serials do not. */
export function significantAudioId(
  before: GameState,
  after: GameState,
  moment: SignificantMoment,
) {
  const priorLog = new Set(before.log.map((line) => line.id));
  return JSON.stringify([
    before.originalSeed,
    before.scenarioId,
    moment.kind,
    moment.title,
    moment.subtitle,
    after.round,
    after.stage,
    [...(after.victoryCards ?? [])].sort(),
    after.log.filter((line) => !priorLog.has(line.id)).map((line) => line.id),
  ]);
}
interface Cue {
  id: string;
  kind: SignificantMomentKind;
}
const endgame = (cue: Cue) => cue.kind === "victory" || cue.kind === "defeat";

/** One source and at most one pending cue. Stopped/hidden/muted events never catch up. */
export class SignificantAudioPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private seen = new Set<string>();
  private active: Cue | null = null;
  private pending: Cue | null = null;
  private epoch = 0;
  private disposed = false;
  private gesture = false;
  private resuming: Promise<void> | undefined;
  private enabled = true;
  private abort = new AbortController();
  constructor(private preferences: AudioPreferences) {
    try {
      const ids: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
      if (Array.isArray(ids))
        this.seen = new Set(
          ids
            .filter((v): v is string => typeof v === "string")
            .slice(-SEEN_LIMIT),
        );
    } catch {
      /* Private browsing may disable storage. */
    }
  }
  setActive(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }
  setPreferences(preferences: AudioPreferences) {
    this.preferences = preferences;
    if (this.gain && this.context)
      this.gain.gain.setValueAtTime(
        preferences.volume,
        this.context.currentTime,
      );
    if (preferences.muted || preferences.volume === 0) this.stop();
  }
  /** Called only by native pointer/key/touch gestures, including enabling sound. */
  unlock() {
    if (
      this.disposed ||
      this.preferences.muted ||
      this.preferences.volume === 0 ||
      document.hidden
    )
      return;
    try {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Context) return;
      if (!this.context) {
        this.context = new Context();
        this.gain = this.context.createGain();
        this.gain.gain.value = this.preferences.volume;
        this.gain.connect(this.context.destination);
      }
      this.gesture = true;
      if (this.context.state !== "running" && this.context.state !== "closed")
        this.resuming = this.context.resume().catch(() => {});
    } catch {
      /* Optional audio cannot interrupt a game action. */
    }
  }
  announce(id: string, kind: SignificantMomentKind) {
    if (this.disposed || this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > SEEN_LIMIT)
      this.seen.delete(this.seen.values().next().value!);
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen]));
    } catch {
      /* Best effort. */
    }
    if (
      !this.enabled ||
      this.preferences.muted ||
      this.preferences.volume === 0 ||
      document.hidden ||
      !this.gesture ||
      !this.context
    )
      return;
    const cue = { id, kind };
    if (this.active) {
      if (endgame(cue)) this.stop();
      else if (endgame(this.active)) return;
      else {
        this.pending = cue;
        return;
      }
    }
    void this.play(cue);
  }
  private async play(cue: Cue) {
    const context = this.context;
    if (!context || !this.gain || this.disposed) return;
    this.active = cue;
    const epoch = ++this.epoch;
    try {
      const src = AUDIO_CUES[cue.kind];
      let buffer = this.buffers.get(src);
      if (!buffer) {
        buffer = fetch(src, { signal: this.abort.signal })
          .then((response) => {
            if (!response.ok) throw new Error("Audio unavailable");
            return response.arrayBuffer();
          })
          .then((bytes) => context.decodeAudioData(bytes));
        this.buffers.set(src, buffer);
        void buffer.catch(() => this.buffers.delete(src));
      }
      const decoded = await buffer;
      await this.resuming;
      if (
        epoch !== this.epoch ||
        this.disposed ||
        !this.enabled ||
        document.hidden ||
        this.preferences.muted ||
        this.preferences.volume === 0 ||
        context.state !== "running"
      ) {
        if (epoch === this.epoch) this.stop();
        return;
      }
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(this.gain);
      source.onended = () => {
        source.disconnect();
        if (epoch !== this.epoch) return;
        this.source = null;
        this.active = null;
        const next = this.pending;
        this.pending = null;
        if (next) void this.play(next);
      };
      this.source = source;
      source.start();
    } catch {
      if (epoch === this.epoch) this.stop();
    }
  }
  stop() {
    this.epoch++;
    this.pending = null;
    this.active = null;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
  }
  hide() {
    this.stop();
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.abort.abort();
    this.gain?.disconnect();
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.buffers.clear();
  }
}
