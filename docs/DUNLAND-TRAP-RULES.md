# The Dunland Trap — original and easy

`the-dunland-trap` implements the three quest stages and eleven new encounter designs, reusing the seven Dunland Warriors / Weary Travellers definitions already used by Fords of Isen and Into Fangorn. The recipes contain 45 / 34 physical encounters. Chief Turch and Munuv Dûv Ravine are set aside and Old South Road begins active, leaving 42 / 31 cards before each player's Boar Clan search. Difficulty is 7; one to four players and the easy-mode starting resource are supported.

## Sources

- The pinned DragnCards catalogue and exact Q04.4/E04.4 recipes in `public/catalog.json` and `public/scenarios.json`; new rows and recipes are retained in `src/data/dunland-trap-*.json`.
- [FFG rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/20/92/20923725-7d79-44fa-8db0-dca8eaa1fe6e/the-dunland-trap-rulesheet.pdf): Time, difficulty, encounter sets and resolving Forced effects after card draws before continuing.
- All eleven encounter faces and six quest faces are cached locally. Printed Stalker icons correct the imported `U` placeholders to attack and defense; counters are not capped, only its printed stat bonus is capped at +4.
- [Scenario guide](https://visionofthepalantir.com/2018/07/03/the-dunland-trap/) supplies a secondary cross-check. Printed wording takes precedence over its shorthand about capped Stalker counters.

## Rules implemented

| Card / stage | Behavior |
| --- | --- |
| The Road to Tharbad | Keep/mulligan completes before Boar enemies enter. Each player searches the deck only; repeated titles are legal. Old South Road is active; Turch and Ravine remain physical set-aside units. Time 2; after the last counter, each player discards the actual hand and draws two, then the stage resets to Time 2 after draw reactions. Eighteen quest progress advances. |
| A Well Laid Trap | Return previous active locations to staging with their existing state and make Ravine active. Each player discards controlled Item/Mount attachments, returning borrowed cards to their physical owner, then keeps one ally and discards the rest. These are discards, not destruction. Each player searches deck/discard for a Boar, the encounter deck is shuffled, and each player shuffles their player discard into their deck and draws one. At combat end, advance to stage three before refresh readying. |
| No Way Out | Turch enters engaged with the first player on 3A. His initial engagement resolves before 3B places Time equal to five times the initial player count. A hero's actual destruction loses immediately, including direct destruction and non-combat damage; discarding a hero is distinct. The last counter causes ordinary engagement checks and ordered fresh-shadow attacks from every engaged enemy. Victory waits for all attacks and their effects to finish. |
| Chief Turch | Cannot have attachments or leave play. Lethal damage remains on the card without destruction, discard or an engine loop. He follows the first player and every enemy engagement, including his later transfers, removes one Time counter. |
| Boar Clan Stalker / Warrior | The engaged player's actual draw of any number of cards respectively adds one resource or one real shadow card. Stalker attack/defense bonuses cap at four; its resources do not. Empty draws do not trigger. Shadow draws do not reshuffle an empty deck. |
| Hithaeglir Foothills | Each copy, active or staging, gains one token after any player's draw. Its threat equals its resources. Printed Surge remains independent. |
| Hills of Dunland | Its staging Forced effect does not stack. A draw discards the top encounter card; a Dunland enemy enters engaged without being revealed. Other cards are simply discarded. Travel requires every player to draw one; each draw's reactions finish while Hills is still in staging. |
| Plains of Enedwaith / Hithaeglir Stream | Replace the resource framework draw with zero / two cards while active. Draws from card effects remain separate. Stream retains Surge. |
| Munuv Dûv Ravine | All Dunland enemies in play receive +1 attack and defense while Ravine is active or staging. |
| Old South Road / shared Conditions | Road removes one Time at refresh end wherever it is in play. The Time keyword and every Off Track attachment are separately ordered effects. In Need of Rest damages for each counter actually removed, including the last; a lethal trigger at stage three prevents victory. |
| Frenzied Attack | Each player draws one, with all draw reactions, then discards every ally in hand. Conditional Surge occurs only if no ally was actually discarded. Canceling When Revealed also cancels this conditional Surge. |
| Dunlending Ambush | A physical Condition attaches to an active location, one per location; otherwise it is discarded. Printed Surge is separate. Exploration causes each player to search deck/discard for a Dunland enemy, put it into play engaged and shuffle afterward. |
| Shadows | Warrior counts all physical attached shadows, including itself; Plains grants +1 attack or +3 undefended; Stream grants +1 and an additional physical shadow. Frenzied Attack prevents all damage until round end, surviving ordinary combat cleanup and save/reload. |

Simultaneous draw reactions join the existing first-player ordering window for Tribesman, Berserker and quest Conditions. Resource draws resolve player by player with intervening Forced effects. Ordinary stage-one defeat can offer The Long Defeat; stage two's card-effect advancement cleans up attachments without a defeat response. Saved set-aside units, pending choices, timers and round-duration protections are validated, including physical-ID collisions and ownership.

## Verification

- `tests/dunland-trap.test.ts`: setup, all printed clauses, multiplayer ownership, exact recipes, physical cards, timing, cancellation, terminal outcomes and saved continuations.
- `tests/simulation.test.ts`: forty complete seeded games using the four Core learning decks, plus hidden/decisions/guided outcome parity. These stress runs are termination/parity checks; the weak Core learning decks lost all forty. Dedicated final-assault cases separately verify victory.
- `scripts/browser-dunland-trap.mjs`: actual menu and table controls at 1280/390/320 pixels; pending choices resumed from saves, all three quest faces, setup, draws, trap, travel, Conditions, final combat, victory/loss and four-player easy mode. All seventeen original faces are decoded locally.
- Additive SQL migration `202610070005_dunland_trap_choices.sql` admits the scenario in saved account choices; local PGlite checks preserve existing ownership policies. Hosted Supabase migration requires the project's configured database access, which is not present in this workspace.

Nightmare and campaign recipes remain reference-only for this quest.
