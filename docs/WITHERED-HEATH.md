# The Withered Heath — original scenario

The original standard Q08.4 and easy E08.4 recipes support one through four players. Standard contains 37 encounter cards, six Lost Caves, Cold-Drake, four Dragon Signs and four two-sided quests. Easy removes eleven encounter cards; Caves and set-aside cards are unchanged.

The source snapshot is `src/data/pending/the-withered-heath-import.json`. It is preserved unchanged. Native TWH runtime cards are in the three `withered-heath-*.json` files; shared Wilds of Rhovanion definitions are reused without redefining their identifiers.

Printed source corrections applied only to runtime definitions:

- The Cold-Drake Attacks! 2B: the original English reverse face says “hit points,” refers to “Cold-Drake” in its final sentence, and limits damage to six per round and eighteen total. The raw transcription says “quest points” and “Ice Drake.” Source: `public/cards/60ba0781-d051-46f0-97b1-e02fb637b94e.B.jpg`.
- Dragon Hatchling receives +1 threat and +1 attack for each Dragon Sign in victory. Its shadow separately gives attack and defense through the phase. Source: `public/cards/beedf6c6-6214-47d8-bd82-81280543b141.jpg`.
- A Cornered Dragon 4A adds the **set-aside** Cold-Drake. Source: `public/cards/9656a1c9-dd90-4096-b2ba-eb2491d08403.jpg`.
- High Falls has printed threat X. Source: `public/cards/2b158c89-59d6-40a2-af56-6db21dc62e73.jpg`.
- Snow-troll’s shadow reads “Attacking enemy makes an additional attack against you after this one.” Source: `public/cards/ebde9bba-fd89-4098-ad60-9d1d4e746d23.jpg`.

The official [rules insert](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec66_the_withered_heath_rules-insert-compressed.pdf), page 1, defines the six-card Lost Caves deck and Deep. After actual travel a Deep location is discarded and physically replaced by the top Caves card. A Dragon Sign instead enters staging and resolves Guarded (enemy). An empty Caves deck ignores Deep. Stage 2 also ignores Deep.

Dragon Signs remain physical cards while set aside, in Caves, or guarded. A guarded enemy or location is immune to player card effects. Once free, the sign enters the normal victory display. The same Cold-Drake unit keeps its damage when moved aside at stage 3 and returned at stage 4. Damage caps count actual damage placed, across every player and attack that round. The final stage wins only when Cold-Drake is defeated.

Stage 2 uses one physical dragon with separate normal attacks against every player. Its first attack preserves the normal combat shadow deal; each subsequent attack receives a fresh shadow. This follows official FAQ 1.9 §1.42 (page 8): “When an enemy makes an additional attack, discard all of its previously dealt shadow cards before dealing it a new shadow card.” The official FAQ source receipt is recorded in `docs/WILDS-RHOVANION-SOURCES.md`.

Off-board Caves order and set-aside identities are not included in the public projection. Saves retain physical identities, guarded relationships, pending choices, once-per-game Caves responses and lasting ready/damage restrictions. The scenario panel exposes counts, the visible guards, victory signs and the dragon’s current damage.

Validation: `node --import tsx --test tests/withered-heath-import.test.ts tests/withered-heath-scenario.test.ts` exercises all eight player-count/mode setups, physical Deep replacements and guards, all four stages, multiplayer shadow and immediate attack ownership, every printed shadow, the shared Wilds encounters, native victory/loss, and save corruption. `node --import tsx scripts/browser-withered-heath.mjs` exercises representative real controls at 1280, 390 and 320 pixels and checks all 31 original card faces against their pinned bytes and browser decoding.
