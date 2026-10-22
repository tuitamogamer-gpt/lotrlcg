import type { AudioPreferences } from "./significant-audio";
import "./audio-settings.css";

export function AudioSettings({
  preferences,
  setMuted,
  setVolume,
}: {
  preferences: AudioPreferences;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
}) {
  return (
    <section
      className="preference-section audio-settings"
      aria-label="Spoken announcements"
    >
      <h3>Spoken announcements</h3>
      <p>
        A brief voice for new chapters, completed side quests, fallen heroes and
        the end of an adventure.
      </p>
      <label className="preference-check">
        <span>
          <strong>Voice announcements</strong>
          <small>
            Play during significant moments, including with reduced motion.
          </small>
        </span>
        <input
          type="checkbox"
          checked={!preferences.muted}
          onChange={(e) => setMuted(!e.target.checked)}
        />
      </label>
      <label className="audio-volume">
        <span>
          Voice volume <output>{Math.round(preferences.volume * 100)}%</output>
        </span>
        <input
          aria-label="Voice volume"
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(preferences.volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
        />
      </label>
    </section>
  );
}
