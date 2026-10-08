# The Antlered Crown

`the-antlered-crown` completes the Ring-maker cycle's six original/easy adventures. Twelve new encounter definitions and three quest cards share eight Dunland Raiders/Warriors definitions. Q04.9/E04.9 contain 47/36 physical encounter cards: after the five fixed setup cards, the main deck contains 28/21 and the Raven deck contains 14/10 before each player chooses a different starting enemy. All eighteen new card faces are local. Difficulty is 7; one to four players and easy resources are supported.

## Sources and interpretation

- Pinned catalog and exact Q04.9/E04.9 recipes, retained in `src/data/antlered-*.json`.
- [Official FFG scenario rules](https://images-cdn.fantasyflightgames.com/filer_public/a9/19/a91988d8-41a3-4653-9b3e-c2a970c1b2a8/mec31-the-antlered-crown-rulesheet.pdf): the six shared enemy designs form the Raven deck; newly printed Raven enemies remain in the main deck. Raven reveals use ordinary encounter resolution, but Surge draws from the main deck. Departing enemies return to their deck of origin. An empty Raven deck immediately reshuffles its discard.
- [Official Voice of Isengard Time rules](https://images-cdn.fantasyflightgames.com/filer_public/cd/e6/cde67433-f555-4fbe-b45d-28dca420e7b3/the-voice-of-isengard-rulesheet.pdf), page 2: Time initializes when a card is **revealed**. Setup explicitly reveals Battlefield and War-camp. Stage three **adds** Raven Chief's Camp, so it enters with zero counters; Raising the Cry can subsequently populate its Time 3. This follows the same distinction used for the Three Trials Guardians.
- [Scenario guide](https://visionofthepalantir.com/2018/07/23/the-antlered-crown/) supplies context. Printed text takes precedence: War-camp puts enemies directly into engagement, and stage two's deadline reveals **one** Raven card, regardless of player count.

## Implemented rules

| Mechanic | Behavior |
| --- | --- |
| Setup and stages | Mulligans finish before first-player Turch, the revealed locations and distinct Raven selections. Stage two shuffles Raven discard into its deck and adds one enemy per player without revealing it. Stage three adds the original set-aside Chief/Camp and P−1 Raven enemies. Front-side effects finish before quest Time initializes. |
| Separate Raven piles | Physical card codes retain origin through combat destruction, discard, extra shadows, discard reshuffles and A Elbereth! Gilthoniel! departures. Empty Raven draws do not fall back to the main deck. Victory cards retain the victory destination. |
| Time | Refresh removes counters from the current quest and every unblanked Time location. Simultaneous expirations are first-player ordered and saved. Stage one removes one counter from every location; stage two reveals one Raven enemy; stage three makes every engaged enemy attack. Quest counters reset after their effects. |
| Locations | Battlefield allocates each player's hand-size damage; Village reveals a Raven enemy; War-camp adds one engaged Raven enemy per player in order; Country raises each player's own hand-size threat; Camp exhausts damaged characters and resets to three. Other locations remain at zero after expiration. |
| Raven Warrior / Skirmisher | Warrior allows distributing the required counter loss across locations before resolving deadlines, removing as much as possible if insufficient counters remain. Skirmisher offers the active-location counter alternative only when it can resolve. |
| Treacheries | Fierce Folk's Doomed precedes cancellation; its event lock begins after every player's draw and draw reactions. Paid, free and response events are blocked for the rest of the round. Raising the Cry resolves expiration effects before refilling zero-Time locations and checks its conditional Surge. Driven Back removes only staging-location progress, adds that amount to total staging threat for the phase, and surges if none was removed. |
| Turch and Chief | Turch follows the first player, is immune to player effects and does not exhaust to defend. Any departure loses the game. Chief cannot have attachments or take damage while Camp remains in play. His attack-start counter removal precedes final defender declaration in both normal and immediate attacks; normal shadows and Stand Together are preserved. |
| Quest progress and victory | Stage two grants +2 quest points only to staging locations. Removing the bonus can immediately explore a location on travel or stage advancement. Stage three ignores ordinary completion: Chief must be in victory at round end, and Turch must survive until then. |
| Shadows | Printed Time X is distinct from counters remaining. Battlefield deals direct defender damage; Country divides printed-Time damage; Skirmisher increases attack; Warrior discards a controlled attachment, including a Trap; Village inserts/resolves two Raven shadows with Silver Lamp handling; Fierce Folk removes active Time only after actual combat destruction. |

The interface shows quest Time, both Raven pile counts, Time tokens on staging/active locations and stage-specific goals. Saves validate per-card Time, Raven membership, setup selections, set-aside physical identities and combat continuations. The additive account migration is checked locally; no hosted Supabase migration has been applied.

## Verification

Sixty-five dedicated semantic cases pass; the broader regression run passed 2,383 non-simulation cases, including local account/RLS checks. Twenty-one hot-seat cases pass. Forty complete Core learning-deck stress games terminate (all lost); hidden, decisions and guided modes preserve full-game outcomes. Explicit normal-combat and client fixtures verify victory. The non-Core campaign simulation is intentionally skipped. The responsive suite passes 57 browser checkpoints at 1280/390/320 pixels, including menu, setup, travel, both stage changes, Time ordering/allocation, extra Raven shadows, Turch defense, event restrictions, round-end victory, loss and four-player easy setup. It decodes all eighteen local card faces. Desktop opening-board and 320px simultaneous-Time screenshots were visually reviewed. Both this suite and Celebrimbor’s Secret pass against the CI default port 5178. Production evidence is recorded with this release.

Campaign and Nightmare variants remain reference-only.
