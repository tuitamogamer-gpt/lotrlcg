# Fords of Isen — original and easy

`fords-of-isen` registers all three quest stages and all sixteen encounter designs from Fords of Isen, Dunland Raiders and Dunland Warriors. The imported recipes contain 34 normal / 24 easy physical encounter cards including The Islet and Gríma; setup removes those two cards and one different chosen enemy per player from the deck. In solo this leaves 31 / 21 cards. Easy mode retains its extra starting hero resource.

## Sources

- The pinned DragnCards reference snapshot in `public/catalog.json` and `public/scenarios.json`, with its hashes and provenance in `public/data-metadata.json`. The complete selected rows and original/easy recipes are retained under `src/data/fords-isen-*.json`.
- [FFG Voice of Isengard rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/cd/e6/cde67433-f555-4fbe-b45d-28dca420e7b3/the-voice-of-isengard-rulesheet.pdf), pages 2–3: Time counters are removed **at the end of each refresh phase**; Gríma is both an objective and an ally, becomes usable after being freed, and prohibits the unique hero version in this scenario. Printed difficulty is 5.
- Original DragnCards card faces are linked by every imported definition; all sixteen encounter fronts and six quest faces are cached locally. The stage-two When Revealed text is on side B, which is retained and implemented.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf): control, Forced abilities, drawing cards, immunity, damage assignment and resource collection.

## Implemented rules

| Cards / stages | Behavior |
| --- | --- |
| Fight at the Fords | Time 5, Islet/Gríma setup, a different Dunland enemy chosen by each player without revealing it; six progress and rescued Gríma under the first player's control are required. The last counter discards guarded or rescued Gríma and loses the game. |
| Dunlending Attack | On entry, search the encounter deck and discard for different enemies; Time 2 and fourteen progress. A timeout allocates each player's own hand-size damage among their characters, then restores two counters. Saved allocations retain their player and physical targets. |
| Hold the Fords | Different-enemy search; Time 3 and sixteen progress. Timeout discards the first player's hand size from the encounter deck, adds the enemies without revealing them, and restores three counters. An exhausted deck is not reshuffled by this discard. Any enemy in play blocks victory. |
| Gríma / The Islet | The Islet is immune to player effects, has victory 1, and adds one threat to Dunland enemies while active. Exploring it frees the same physical Gríma. He follows the first player without readying; his action exhausts him to draw one card. Losing him, including his controller's elimination, ends the game. |
| Fords of Isen | Each unblanked staging copy prevents resource gains from card effects, including transfers and Treebeard/Radagast's ability-based collection. Framework hero collection remains available. Becoming active draws each player up to five cards; each multi-card draw generates one draw trigger. |
| The King's Road | Any player with three cards adds three quest points. Any player with five makes travel mandatory when able; the UI identifies the required travel. A smaller hand can immediately explore an already-progressed Road. |
| Gap of Rohan | Staging copies stack +1 attack to Dunland enemies. Shadow gives +1 attack and removes one time counter when that attack actually destroys a character. Separate shadow copies retain separate counter removals. |
| Pillaging and Burning | Each player draws, then raises threat by their hand size. Its shadow discards a controlled attachment, or all controlled attachments if undefended; control can differ from ownership and includes quest attachments. |
| Down From The Hills | Each player first chooses counter removal or a search. The encounter deck stays private until search is chosen. Searched enemies are revealed normally, unlike setup additions. Any player's five-card hand prevents When Revealed cancellation. |
| Ill Tidings | The first player draws the physical encounter card into hand, which triggers draw reactions and can grant surge at five cards. It contributes to hand-size thresholds but cannot be played, discarded, exchanged by Gildor, passed with Message from Elrond or spent on Éowyn/Protector/Erestor costs. |
| Dunland Prowler / Dunlending Bandit | Prowler gains surge at a three-card hand and +1 threat at five, checking all players. Bandit's attack counts its engaged player's hand dynamically; its shadow checks the defending player's hand. |
| Dunland Raider / Dunland Chieftain | Raider assigns hand-size damage to the engaged player's characters. Chieftain discards that many cards and engages the topmost Dunland enemy from that discard (the last eligible card discarded), invoking engagement abilities without When Revealed. Neither discard reshuffles an empty deck. |
| Dunland Tribesman / Dunland Berserker | Tribesman's reveal draws for everyone. Each actual draw gives every eligible Tribesman +1 threat until round end, regardless of cards drawn. A Berserker attacks when its engaged player draws, even inside another attack; physical shadows and suspended combat survive reload. Its shadow adds an attack after the current one. |
| Old Hatreds / Wild Men of Dunland | Surge and physical Conditions on the current quest. Each copy raises the drawing player's threat / assigns one damage per draw. The first player can order simultaneous Forced effects. Quest completion discards them. Power of Orthanc, Miner of the Iron Hills and Elrond can remove them through ordinary card controls. |

Multi-part damage allocations are collected before being dealt; amounts assigned to the same character are combined into one damage instance. Real damage cancellation and replacement remain available. Random discards that select Ill Tidings leave it in hand; chosen discard costs and exchanges exclude it up front. Encounter draws, deck searches, cards added to hand and normal card draws remain distinct operations.

The visible scenario counter and event history show remaining Time, while hidden deck order remains private. Pending searches, damage allocations, Forced ordering, nested attacks and card identity round-trip through ordinary saves. Scenario art and the adventure selector use the existing river presentation. Account-choice validation has a new additive SQL migration; it is tested locally, with no hosted Supabase changes.

## Verification and scope

`tests/fords-isen.test.ts` contains 48 semantic tests and exercises printed quantities, setup for 1–4 players in both difficulties, progression and loss, all encounter clauses and shadows, cross-player control, resource restrictions, locked hand cards, Condition removal and malformed saves. The complete-game matrix runs forty ordinary seeded games plus paired guided/hidden/decisions runs; it checks termination and identical rules outcomes, not balance or winning strategy. The campaign case remains intentionally unsupported.

`npm run test:ring-maker-quests` runs the actual browser controls at 1280×900, 390×844 and 320×750: fresh scenario selection, setup and reload, rescue and stage transition, Time damage/reset/loss, Gríma-triggered Berserker defence, Forced ordering, mandatory travel, multiplayer hills choices, locked Ill Tidings and four-player easy setup. All 22 original card faces are decoded. The suite passes 45 responsive checkpoints. It is included in GitHub CI. Screenshots and logs are kept under ignored `output/` paths.

This registration enables only original/easy Fords of Isen. Its Nightmare version, To Catch an Orc, Into Fangorn and all six Ring-maker Adventure Pack encounter quests remain pending. The already completed Ring-maker player-card pool is unchanged.
