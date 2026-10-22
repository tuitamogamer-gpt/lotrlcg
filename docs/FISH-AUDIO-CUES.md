# Fish Audio major-event cues

Five short English announcements accompany the existing significant-moment events.
They were generated on 22 October 2026 with Fish Audio `s2.1-pro` and the official
stock voice **Adrian** (`bf322df2096a46f18c579d0baa36f41d`, author **Fish Official**).
No voice was cloned or impersonated for these assets.

| Moment kind  | Public asset               | Spoken line          | Duration   |
| ------------ | -------------------------- | -------------------- | ---------- |
| `stage`      | `/audio/quest-advance.mp3` | A new path opens.    | 1.593375 s |
| `side-quest` | `/audio/side-quest.mp3`    | The way is clear.    | 1.227688 s |
| `hero-fall`  | `/audio/hero-fall.mp3`     | A hero has fallen.   | 1.515 s    |
| `victory`    | `/audio/victory.mp3`       | Victory is ours.     | 1.593375 s |
| `defeat`     | `/audio/defeat.mp3`        | Our quest has ended. | 1.593375 s |

[`public/audio/manifest.json`](../public/audio/manifest.json) records the exact
generation prompts, Fish task IDs, permanent source URLs, SHA-256 hashes, charged
credits, durations and measured audio levels. Its `cues` object uses the existing
moment-kind names; each entry provides `src`, `text` and `durationSeconds` for the
playback integration.

The five successful TTS calls charged **118 package credits** in total, including
delivery tags. The original Fish-generated MP3 bytes are retained: mono, 44.1 kHz,
128 kb/s, **120,710 bytes** in total. The application serves these files locally and
does not need Fish credentials or runtime generation requests.

Full-file FFmpeg decoding succeeded for every asset. Measured true peaks range
from −9.56 to −5.59 dBFS, with integrated loudness from −24.97 to −22.45 LUFS. No
clipping was detected. These technical checks and the source provenance are
recorded in the manifest; they do not alter or re-encode the generated audio.

Playback belongs to the significant-moment audio controller, which controls the
user's sound preference, volume, gesture unlock, deduplication and event priority.
Ordinary card plays, routine phase changes, seat switches, reloads and Undo must
not produce new announcements.
