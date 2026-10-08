# Intruders in Chetwood: prepared import

Status: reference data and artwork are prepared. Gameplay remains pending. The next implementation can use `src/data/pending/intruders-in-chetwood-import.json` without downloading or reconstructing the sources again.

The bundle contains 19 original definitions across Intruders in Chetwood, Angmar Orcs, Eriador Wilds and Iârion; 20 local JPEG faces include both sides of Stop the War Party. Every face has its original HTTPS source, byte count and SHA-256. The card library uses these local faces independently of automation status. Original variable stats are retained: all three of Iârion's combat/quest stats are X, and Shrouded Hills has X threat. The printed Orc Rearguard face confirms Victory 10.

| Recipe         | Encounter deck | Initially staged | Objective ally | Quest deck |
| -------------- | -------------: | ---------------: | -------------: | ---------: |
| Q05.1 standard |             36 |  1 Orc War Party |       1 Iârion |          1 |
| E05.1 easy     |             24 |  1 Orc War Party |       1 Iârion |          1 |

These are exact upstream sections before each player's additional, different setup location is selected. The import preserves both `cards` rows and `sections` and checks that their physical quantities agree. It excludes the Nightmare recipe.

Reproduce or validate the preparation:

```sh
npm run prepare:scenario-import -- --recipe Q05.1 --check
npm run prepare:scenario-import -- --recipe Q05.1 --download
node --import tsx --test tests/pending-imports.test.ts
node scripts/browser-pending-import.mjs
```

The preparation command writes data and local artwork only. Registering automated cards and scenarios remains a separate implementation step. The source expansion rules are linked in the bundle.

## Rules to implement next

| Card or group                                | Required behavior                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop the War Party                           | 30 quest points; each player chooses a different setup location; no framework engagement checks; end-of-refresh threat for each staged enemy; victory requires controlled Iârion and no Orc War Party in play.                |
| Iârion                                       | Follows first player; X willpower/attack/defense equals quest cards in play; readies after an encounter side quest is revealed; leaving play loses the scenario. Rescue Iârion needs an explicit facedown capture exception.  |
| Orc War Party                                | No attachments; while staged, prevents damage to staged enemies; blocks victory in every play area.                                                                                                                           |
| Orc Rearguard                                | Maximum three progress on the current quest each round; extra encounter reveal at the end of staging when current. Track the printed limit through quest switches and direct progress.                                        |
| Rescue Iârion                                | Physical captured ally, Time 4 on this side quest even when it is not current, loss on timeout, exhausted return to first player on defeat.                                                                                   |
| Orc Ambush                                   | Global Orc threat/attack/defense bonuses; each player searches deck/discard for a physical Orc to put into engagement; shuffle afterward; no When Revealed on that enemy.                                                     |
| Lost in the Wilderness                       | Preserve every physical hidden hand card and owner beneath the quest; return them on defeat; save validation and public-state redaction.                                                                                      |
| Pressing Needs                               | Doomed 2; either search/reveal an encounter side quest or select a different quest for the remainder of this phase; shuffle the encounter deck.                                                                               |
| Angmar Orc / Marauder / Captain              | Ally discard versus extra reveal; return after attack destroys an ally; Captain's physical top-player-card discard and additional attack on an ally. Preserve actual attacker and defending player through immediate attacks. |
| Borders / Chetwood Forest                    | Ordered beginning-of-quest enemy returns; travel chooses a player to engage a staging enemy as a cost, resolving engagement reactions.                                                                                        |
| Outlying Homestead                           | Doomed 1; staged threat-reduction prohibition; paid travel encounter reveal.                                                                                                                                                  |
| Rugged Country / Shrouded Hills              | Current-side-quest threat bonus; count all quest cards in play; conditional Surge.                                                                                                                                            |
| Sudden Assault / Surprising Speed            | Compare committed willpower to staging threat; real staging attacks with independent shadows; shuffle Assault plus discard if no attack; per-player enemy return and conditional Surge/Doomed.                                |
| Weight of Responsibility and printed shadows | Count physical quest cards; ordered multi-reveals and attachment discards; defending-player identity; defense reduction; return-after-attack and ally-destruction conditions.                                                 |

The player side-quest framework already separates main/current quest identity, physical side-quest progress, phase duration, quest attachments and separated staging areas. Extend it to encounter side quests, uncancelable revelation and per-card Time; do not substitute encounter side quests into the main quest deck. Keep main quest rules active during side-quest selection. The pending bundle alone does not register any of these rules.

Verification before registration should include 1–4-player normal/easy setup, distinct physical setup choices, both victory/loss gates, every printed shadow, uncancelable side-quest revelation, captured identities, Time on inactive side quests, progress caps, all Pressing Needs branches, reloads during searches and multiplayer responses, complete-game termination and responsive browser interaction.

## Remaining Lost Realm source bundles

The same checked preparation is complete for `Q05.2` / `E05.2` (The Weather Hills) and `Q05.3` / `E05.3` (Deadmen's Dike). Their bundles are `src/data/pending/the-weather-hills-import.json` and `src/data/pending/deadmen-s-dike-import.json`. Together the three bundles cover 58 distinct original encounter/quest definitions and 64 local faces, with 9,732,390 bytes of verified artwork. Shared definitions keep the same identity and source hash.

The Weather Hills retains all six original recipe zones: quest deck, encounter deck, separate Orc deck, set-aside cards, staged cards and active location. Standard/easy initial encounter decks contain 31/24 cards and Orc decks contain 11/9; both sides of Hunting the Orcs are preserved. Deadmen's Dike retains 41/28 encounter cards, its set-aside and staging cards, Iârion and both quest stages. These counts describe source recipes before scripted setup, not automated play.

All three gameplay implementations remain pending. `tests/pending-imports.test.ts` checks source equivalence, recipe zones, image hashes and the automation boundary. `scripts/browser-pending-import.mjs` covers the library at 1280/390/320, checks variable stats and reverse quest art, and decodes all 64 faces locally.

Validation: 30 catalog, product, shared-import and bundle integrity cases pass. Fifteen browser checkpoints pass at 1280/390/320 pixels, with every local face decoded, no browser errors and no horizontal overflow. The mobile Iârion inspector was visually reviewed. Type checking and the production build pass.
