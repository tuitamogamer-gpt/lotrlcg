# Built-in preconstructed fellowships

The shared fellowship picker shows all ten supported printed recipes without a catalogue import or a saved custom deck. It is used by the adventure lobby, My Fellowship, hot-seat player assignment and campaign deck selection.

| Group | Choices | Main deck |
| --- | --- | --- |
| Core learning decks | Leadership, Tactics, Spirit, Lore | 30 cards and 3 heroes each |
| Retail Starter Decks | Dwarves of Durin, Elves of Lórien, Defenders of Gondor, Riders of Rohan | 50 cards and 3 heroes each |
| Limited Collector’s Edition | Leadership / Spirit, Lore / Tactics | 50 cards and 3 heroes each |

The original `STARTERS` registry still means the four unchanged Core learning lists. `BUILT_IN_DECKS` combines those lists with the six fully scripted recipes from `official-starter-decks.json`; sideboard cards never enter their main decks. Published-deck catalogue selections resolve to these same permanent ids. Existing custom/imported lists retain their ids and saves.

Each choice shows named hero scans, printed provenance, deck size and starting threat, with independent inspection. Group headings distinguish the three kinds of printed list and the custom deck builder. Choosing a deck retains its actual recipe across new games, retries, campaign continuation, reloads and device/account setup choices. Hot-seat conflict checks compare hero names, preventing two versions of a unique hero across players.

The account schema extension is `supabase/migrations/202610070001_preconstructed_choices.sql`. It expands accepted deck and scenario references and preserves the existing row ownership policies. Local PGlite tests apply all migrations in order and verify valid choices, malformed/duplicate rejection and cross-account isolation. No hosted Supabase migration was run for this change.

Evidence: `tests/preconstructed-decks.test.ts`, `tests/setup-decks.test.ts`, `tests/fellowship-choices.test.ts` and `tests/account-rls.test.ts` exercise setup, physical recipes, solo/hot-seat saves, retry, campaign and persistence. `npm run test:precons` selects every added precon on a fresh device, checks heroes/art/threat, plays and resumes the exact 50-card list, combines four retail fellowships and checks 1280/390/320px layouts.
