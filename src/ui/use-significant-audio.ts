import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../game/types";
import type { SignificantMoment } from "./significant-moments";
import {
  AUDIO_KEY,
  parseAudioPreferences,
  significantAudioId,
  SignificantAudioPlayer,
} from "./significant-audio";
import type { AudioPreferences } from "./significant-audio";

export function useSignificantAudio(active: boolean, journey?: number) {
  const [preferences, setPreferences] = useState(() => {
    try {
      return parseAudioPreferences(localStorage.getItem(AUDIO_KEY));
    } catch {
      return parseAudioPreferences(null);
    }
  });
  const current = useRef(preferences);
  const player = useRef<SignificantAudioPlayer | null>(null);
  useEffect(() => {
    const audio = new SignificantAudioPlayer(current.current);
    player.current = audio;
    const unlock = (event: Event) => {
      if (event.isTrusted) audio.unlock();
    };
    const visibility = () => {
      if (document.hidden) audio.hide();
    };
    const pagehide = () => audio.hide();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("touchend", unlock, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("touchend", unlock, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      audio.dispose();
      player.current = null;
    };
  }, []);
  useEffect(() => {
    player.current?.stop();
    player.current?.setActive(active);
  }, [active, journey]);
  const update = useCallback((next: AudioPreferences, persist = true) => {
    current.current = next;
    setPreferences(next);
    player.current?.setPreferences(next);
    if (persist && !next.muted && next.volume > 0) player.current?.unlock();
    if (persist)
      try {
        localStorage.setItem(AUDIO_KEY, JSON.stringify(next));
      } catch {
        /* Device storage may be full. */
      }
  }, []);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (event.key === AUDIO_KEY)
        update(parseAudioPreferences(event.newValue), false);
    };
    window.addEventListener("storage", storage);
    return () => window.removeEventListener("storage", storage);
  }, [update]);
  return {
    preferences,
    setMuted: useCallback(
      (muted: boolean) => update({ ...current.current, muted }),
      [update],
    ),
    setVolume: useCallback(
      (volume: number) =>
        update({
          ...current.current,
          volume: Math.max(0, Math.min(1, volume)),
        }),
      [update],
    ),
    stop: useCallback(() => player.current?.stop(), []),
    announce: useCallback(
      (before: GameState, after: GameState, moment: SignificantMoment) => {
        player.current?.announce(
          significantAudioId(before, after, moment),
          moment.kind,
        );
      },
      [],
    ),
  };
}
