# Original Angmar Awakened

This block covers all six original Adventure Packs: sixty published player designs and six quests in standard/easy mode for classic solo and 1–4 players in local hot-seat. The runtime adds 58 player definitions; Elf-friend (10093) and The Long Defeat (10122) reuse existing implementations. The registered pool contains 496 player definitions, including 56 heroes, and 45 adventures.

## Source preservation

The immutable `src/data/pending/*-import.json` bundles preserve every source definition, recipe section and artwork hash. They retain their preparation status `pending-rules`; the runtime registry and `public/automation-coverage.json` report verified implemented support. The source catalog remains unchanged. Rulesheet references remain reference records rather than playable cards.

| Adventure                | Standard recipe | Easy recipe | Source shared encounter deck, standard/easy | Source definitions | Cached face entries |
| ------------------------ | --------------- | ----------- | ------------------------------------------- | ------------------ | ------------------- |
| The Wastes of Eriador    | Q05.4           | E05.4       | 44 / 30                                     | 25                 | 29                  |
| Escape from Mount Gram   | Q05.5           | E05.5       | 20 / 16                                     | 20                 | 23                  |
| Across the Ettenmoors    | Q05.6           | E05.6       | 36 / 23                                     | 30                 | 34                  |
| The Treachery of Rhudaur | Q05.7           | E05.7       | 41 / 29                                     | 27                 | 33                  |
| The Battle of Carn Dûm   | Q05.8           | E05.8       | 42 / 27                                     | 23                 | 27                  |
| The Dread Realm          | Q05.9           | E05.9       | 46 / 29                                     | 24                 | 28                  |

These are source-zone counts before printed setup searches, reveals, separately listed cards and player-count adjustments. For example, Mount Gram's four Prison Cells join the searchable initial pool, and Carn Dûm's additional setup Garrisons are searched by player count. Setup never invents an extra copy when easy-mode printed quantities cannot meet the maximum player count.

All 174 source-face entries are cached; shared faces retain their existing bytes. The three physical Rhudaur Clue reverses are also cached and retain their canonical OCTGN identities. All 58 new player images are cached from their RingsDB source URLs. `reference-scenario-art.json` maps original URLs to local files.

Source rules come from the original printed fronts, reverses and included rulesheets, the pinned DragnCards/OCTGN catalog, and the official Rules Reference/FAQ. Runtime-only corrections resolve source transcription omissions without rewriting the immutable snapshots:

- Mount Gram's final stage requires 16 progress; Goblin Tormentor has Capture 1. Capturing an ally never captures a hero, and captured heroes remain out of play rather than destroyed.
- Carn Dûm's second reverse is Midwinter's Crux. Furious Charge retains its printed Surge. Thaurdir's physical identity, tokens and attachments persist through Captain/Champion flips.
- Player side quests retain original printed targets and Victory: Scout Ahead 4/1, Double Back 4/1, Delay the Enemy 8/1 with Battle, and Send for Aid 6/1.
- Ettenmoors objective-locations follow location rules while retaining their printed objective identity; Rhudaur side quests flip into their original physical Clue backs.
- Reanimated Dead is an internal enemy representation of the actual facedown player card. It retains physical identity and owner; it is not an added published design.

## Rules and interface

Valour uses the triggering player's current threat. Elven-light and Lords of the Eldar are played from the actual owner's discard pile; recurring choices retain physical indices through reload. Sword-thain changes an eligible ally into a hero in play without changing its printed definition or losing tokens. Favor of the Valar attaches to an individual threat dial and replaces that player's threat elimination before elimination is processed.

The six scenario panels show day/night, capture counts and isolated areas, Safe shelter, main-quest Time and Clues, Thaurdir's form and shadow count, and Daechanar/reanimation state. Inspecting either printed face keeps its artwork, name, traits and primary rules together; the other face's rules remain separately labelled. Private captured decks and facedown player-card identities are represented by counts in the public state. Significant-event animations retain the existing reduced-motion setting.

Further rules notes: [Wastes](WASTES-ERIADOR-RULES.md), [Mount Gram](MOUNT-GRAM-RULES.md), [Ettenmoors](across-the-ettenmoors-rules.md), [Rhudaur](the-treachery-of-rhudaur-rules.md), [Carn Dûm](CARN-DUM-RULES.md), [Dread Realm](THE-DREAD-REALM.md) and [all sixty player designs](ANGMAR-AWAKENED-PLAYER-SCRIPTS.md). Dedicated scenario and player tests cover printed effects, ownership, real combat, interrupted choices and save/reload. Complete seeded games test normal/easy × 1–4 players with a restore after every action; browser checks exercise actual menus, dialogs, scenario panels, artwork and mobile layouts. Sampled automated losses establish termination and save invariants; semantic fixtures separately verify printed victory conditions.

Campaign and Nightmare variants are retained in the reference catalog. The implemented Angmar scenarios use their original standard/easy recipes.

## Reproducing validation

Run `npm run check`, `npm run build` and `npm run test:engine` for types, the production bundle and the rules suite. `npm run test:angmar-simulation` exercises 384 complete seeded games across all six quests, both modes and 1–4 players, restoring a serialized save after every action. `npm run test:browser-angmar` checks actual setup menus, printed faces, scenario decisions, discard play and responsive layouts against the production preview on port 5178; `GAME_URL` can point the same checks at a deployment.

The CI workflow runs the rules suite, four complete-game simulation shards, separate multiplayer jobs for each Angmar quest, and the dedicated Angmar browser group. Existing browser groups also cover the earlier scenarios, preconstructed decks and significant-event animations.
