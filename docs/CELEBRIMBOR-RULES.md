# Celebrimbor’s Secret — original and easy

`celebrimbors-secret` imports thirteen encounter definitions and two quests, sharing seven Misty Mountain Orcs/Broken Lands encounters. Q04.8/E04.8 contain 49/39 physical encounters, including the four fixed setup cards and four selectable starting locations. Fixed setup leaves 45/35 cards, before each player chooses a different location. Difficulty is 6; one to four players and official easy resources are supported.

## Sources

- Pinned catalog and exact Q04.8/E04.8 recipes. Original rows are retained in `src/data/celebrimbor-*.json`, including the upstream encounter-set spelling `Celembrimbor's Secret`. The scenario title matches the catalog so both recipes resolve to its automation.
- [Official FFG rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/d5/4c/d54cf57f-de1d-4934-abfc-c0fdbc9e0f7a/celebrimbors-secret-rulesheet.pdf): Scour effects resolve when instructed, in first-player order. Cards placed underneath The Orcs’ Search lose tokens/attachments and are out of play.
- Printed cards and all seventeen original local front/back scans.
- [Scenario guide](https://visionofthepalantir.com/2018/06/30/celebrimbors-secret/) and the [FFG forum archive discussion](https://ffg-forum-archive.entropicdreams.com/topic/101214-a-few-questions-concerning-certain-cards/). The latter is community interpretation, not a designer ruling: City Remains can return the referenced Prowling Orc/Collapsed Tower from discard by resolving their explicit movement instructions.
- The general choice rule requires a fully resolvable alternative when one exists. Bellach’s Scout cannot choose damage without an active location; Discovered’s hand alternative requires a card from every living player. Adding searched Orcs does not trigger When Revealed or Surge.

## Implemented rules

| Card / stage | Behavior |
| --- | --- |
| The Ruins of Ost-in-Edhil | Finish mulligans, add Bellach/Search/Chamber, physically attach the Mould to the Chamber, then each player chooses a distinct location. Time 3 triggers current Scour effects before resetting. Fourteen progress advances only after a hero holds the Mould. |
| The Enemy’s Servant | Resolve Scour, then Bellach attacks the Mould’s controller; normal/Sentinel defense applies. Transfer the same physical Mould to Bellach after the attack, then place Time 3. Twelve progress removes Bellach’s protection. Reclaiming the Mould with that progress wins. |
| Bellach | Search count sets his threat. Quest-granted player immunity and the engagement restriction persist through blanking of his own text. Scour searches both encounter piles for one Orc per player, adds without revealing and shuffles. Newly added Scour cards are outside the original simultaneous snapshot. |
| The Orcs’ Search | Captures damaged locations using printed quest points. Attachments leave and tokens are cleared; capture is not exploration or victory. Physical hidden player cards retain ownership. Refresh threat and quest Time can be ordered by the first player, so a newly captured card can affect the same refresh. Hidden hand-card identities are omitted from public logs/state. |
| Chamber / Mould | Chamber is immune, contributes player-count threat and costs three quest progress to travel. Capture loses immediately. Exploration releases the physical Mould for a mandatory first-player hero choice. Its bearer leaving play loses, including discard and elimination; changing first player does not transfer the Mould. |
| Prowling Orc | Scour engages the highest-threat player, with an explicit first-player tie decision, then attacks after engagement effects. A completed attack damages the active location. Preventing the attack prevents that damage. |
| Scout | Revealing offers active-location damage or another reveal. Its Scour and shadow each place one active-location damage. |
| Plaza / Tower / Foundation | Plaza receives one damage on each actual staging entry. Tower’s Scour returns it from active and adds two damage. Foundation’s Scour is non-stacking and distributes one damage per location; its travel damage can remove it before active entry. |
| City Remains | Any positive progress triggers the topmost discard-pile Scour once, including progress that explores it. Returning an Orc/Tower consumes its actual discard entry, does not reveal it and resolves its Scour movement/attack/damage. |
| Discovered / Ruins / Spies | Explicit fully resolvable alternatives, physical random hand transfers, conditional Surge, partial exhaustion when fewer than X ready characters remain and normal cancellation are implemented. Spies surges only if no player exhausted a character. |
| Shadows | Excess combat damage to locations; divided damage to controlled characters; physical destroyed-card capture; threat based on Search after destruction; destroyed ally’s printed cost; and controlled non-objective attachment discard, including Trap and quest attachments. Direct shadow damage is distinct from attack destruction. |

The UI displays current Time, Search count, refresh consequences and the Mould’s current holder with inspection. The Search objective is labeled with its facedown count. Saves validate hidden physical IDs, cleared tokens, counters, pending choices and combat flags. A pre-existing data-to-runtime import cycle in Blood of Gondor validation was removed by injecting its card-type check from the save layer; the same validation rules remain covered by existing tests.

## Verification

- 59 dedicated semantic checks cover all eight normal/easy multiplayer setups, actual victory, Time/Scour ordering, ownership, hidden information, search/re-entry, travel, immunity, shadows and malformed saves. The initial full non-simulation regression passes 2,318 cases; the subsequent public-log privacy case also passes. All 21 ordinary hot-seat cases pass.
- Forty complete Core learning-deck games terminate legally; all forty lose. Hidden/decisions/guided parity checks pass, with the non-Core campaign case intentionally skipped. Explicit semantic/client fixtures demonstrate reachable victory.
- The browser suite passes 75 checkpoints at 1280/390/320 pixels for actual menu/opening/setup, travel, exploration, claims, stage transition, attack targeting, saved Scour/damage/exhaustion choices, hidden capture, victory/loss and four-player easy setup. All seventeen faces decode. Narrow damage-choice and desktop Bellach-stage screenshots were reviewed.
- TypeScript, production build, coverage audit and the additive SQL/RLS account test pass. No hosted Supabase migration was applied.

Nightmare and campaign variants remain reference-only.
