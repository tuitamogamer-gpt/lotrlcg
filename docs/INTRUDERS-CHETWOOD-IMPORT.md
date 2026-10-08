# Lost Realm source imports

Status: Intruders in Chetwood gameplay is implemented; see [Chetwood rules and verification](CHETWOOD-RULES.md). `src/data/pending/intruders-in-chetwood-import.json` remains the immutable preparation snapshot, including its historical `pending-rules` status. Active definitions and recipes live in `src/data/chetwood-*.json`. The Weather Hills is also implemented; see [Weather Hills import](WEATHER-HILLS-IMPORT.md). Deadmen’s Dike is also implemented; see [Dike import](DEADMENS-DIKE-IMPORT.md).

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

## Chetwood implementation checklist (completed)

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

The shared player/encounter side-quest framework separates main/current quest identity, physical side-quest progress, phase duration, quest attachments and separated staging areas. Encounter side quests use uncancelable revelation and per-card Time without entering the main quest deck. Main quest rules stay active during side-quest selection. The snapshot itself remains separate from runtime registration.

Implemented Chetwood verification includes 1–4-player normal/easy setup, distinct physical setup choices, both victory/loss gates, every printed shadow, uncancelable side-quest revelation, captured identities, Time on inactive side quests, progress caps, all Pressing Needs branches, reloads during searches and multiplayer responses, complete-game termination and responsive browser interaction.

## Remaining Lost Realm source bundles

The same checked preparation is complete for `Q05.2` / `E05.2` (The Weather Hills) and `Q05.3` / `E05.3` (Deadmen's Dike). Their bundles are `src/data/pending/the-weather-hills-import.json` and `src/data/pending/deadmen-s-dike-import.json`. Together the three bundles cover 58 distinct original encounter/quest definitions and 64 local faces, with 9,732,390 bytes of verified artwork. Shared definitions keep the same identity and source hash.

The Weather Hills retains all six original recipe zones: quest deck, encounter deck, separate Orc deck, set-aside cards, staged cards and active location. Standard/easy initial encounter decks contain 31/24 cards and Orc decks contain 11/9; both sides of Hunting the Orcs are preserved. Deadmen's Dike retains 41/28 encounter cards, its set-aside and staging cards, Iârion and both quest stages. These counts describe source recipes before scripted setup, not automated play.

All three Lost Realm scenarios now resolve to implemented normal/easy handlers and their recipe controls are enabled. The preparation snapshots retain their historical pending status as source provenance. `tests/pending-imports.test.ts` checks source equivalence, recipe zones, image hashes and the automation boundary. `scripts/browser-pending-import.mjs` covers the library at 1280/390/320, checks variable stats and reverse quest art, and decodes all 64 faces locally.

### Original-face clarifications for the next implementation

The prepared bundles preserve the upstream catalog verbatim apart from local image paths. Compare their transcribed rules with the included original faces before implementing them:

- **Hunting the Orcs** (`18484359-d4b5-4ed6-b7be-e013fae4df43`): the printed front flips the objective and transfers its resource tokens. Its catalog text additionally says to advance to stage 2; that clause is not on the printed front. The printed **Savage Counter-attack** reverse has the actual forced stage-2A transition when it enters play. Implement one transition after transferring the tokens, rather than separately advancing for both transcriptions.
- **Scattered Among the Hills / Cornered Animals**: the transcribed text says “Amon Ford”; the original quest face and the physical recipe identify **Amon Forn** (`ea225b12-75e1-4253-9458-c71c1c304a8f`). Resolve the location by that identity.
- **Broken Battlements** (`82ca7902-f8fa-4352-8f54-f5f6a8875c51`): the original face reads “each player discards the top 5 cards of his deck and places 1 time counter here.” Preserve the per-player scope when implementing its Time reset; verify multiplayer timing against the official rules rather than assuming a single total replacement counter.

These are source-review notes for pending gameplay. They do not register rules or alter the original catalog records.

Validation: 30 catalog, product, shared-import and bundle integrity cases pass. Fifteen browser checkpoints pass at 1280/390/320 pixels, with every local face decoded, no browser errors and no horizontal overflow. The mobile Iârion inspector was visually reviewed. Type checking and the production build pass.
