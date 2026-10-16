# Original The Wilds of Rhovanion sources

Checked 16 October 2026. This promotion covers the **original MEC65 deluxe**,
including all three original scenarios, standard and easy: **Journey Up the
Anduin** (`Q08.1`/`E08.1`), **Lost in Mirkwood** (`Q08.2`/`E08.2`), and
**The King's Quest** (`Q08.3`/`E08.3`). Later campaign, Nightmare and revised
products are excluded.

The [publisher's original seven-page insert](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec65_web_the-wilds-of_rhovanion_rules.pdf)
was linked from the official LOTR LCG product support page and downloaded
successfully: **4,748,254 bytes**, SHA-256
`a822a79776d1e7df282c12789b21ed5b001025e016413b4a81602328f3b83dd6`.
Page 1 lists **156 physical components**: two heroes, 39 other player cards,
102 encounter cards (one double-sided), and 13 double-sided quests. Pages
2–5 give **difficulty 5 for all three scenarios**, original encounter sets,
Guarded (X), the Evil Creatures deck, the Caves deck and Deep. Page 7 gives
easy-mode setup: one extra resource per hero and removal of the gold-ring
encounter copies.

The [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
was also read for general immunity, timing, control and combat rules. It has
14,383,996 bytes and SHA-256
`a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
Its general rules apply; it contains no MEC65-specific erratum. In particular,
immunity does not prevent a normal attack, while non-combat player effects
cannot target an immune enemy.

Hall of Beorn's original inventories were checked independently:
[Anduin](https://hallofbeorn.com/LotR/Scenarios/Journey-Up-the-Anduin),
[Mirkwood](https://hallofbeorn.com/LotR/Scenarios/Lost-in-Mirkwood), and
[King's Quest](https://hallofbeorn.com/LotR/Scenarios/The-King%27s-Quest).
Only their Normal/Easy columns are used. Original DragnCards scans supply
all printed faces; source URL, local path, bytes and SHA-256 are frozen in
the three pending snapshots. Across the three scenarios there are **106
unique original scenario faces**, including **78 new MEC65 faces** and 28
already existing Core Set faces. The new designs consist of 51 non-quest
identities (one has Haldan on its reverse) and 13 quests with two faces each.
The runtime Haldan record is a reverse-face view of that same physical card.

| Immutable input                             | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                       | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                     | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`       | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `pending/journey-up-the-anduin-import.json` | `1e9546bd65a90e11acccd1e92b100f924821825b77ba772d280b71d3dac34e45` |
| `pending/lost-in-mirkwood-import.json`      | `be88807a6062d9734bc1470828270d5bbd9a29cb69af3f816db43fa6e322d2a3` |
| `pending/the-king-s-quest-import.json`      | `69cf09709d4388b7eeedc47e019aaac42d88c87321513947725955b6edd533ff` |

The generated King's Quest snapshot retains its import tool's literal
`the-king-s-quest` slug. Runtime uses the canonical `the-kings-quest` ID.
No upstream catalog or reference recipe is rewritten.

| Original recipe   | Quests | Initial encounter deck |       Auxiliary deck |  Set aside / setup | Total |
| ----------------- | -----: | ---------------------: | -------------------: | -----------------: | ----: |
| Anduin standard   |      3 |                     35 |     8 Evil Creatures |                  2 |    48 |
| Anduin easy       |      3 |                     22 |     6 Evil Creatures |                  2 |    33 |
| Mirkwood standard |      7 |                     32 | 12 Spiders + 14 Orcs | 5 staging + Haldan |    71 |
| Mirkwood easy     |      7 |                     24 |   8 Spiders + 9 Orcs | 5 staging + Haldan |    54 |
| King's standard   |      3 |                     35 |              6 Caves |                  6 |    50 |
| King's easy       |      3 |                     26 |              6 Caves |                  4 |    39 |

Anduin setup removes actual locations from the shuffled encounter deck.
Mirkwood's four Forest Spiders are setup components: one per player enters
staging and the remaining copies enter the shuffled encounter deck. Its
Searching objective and Haldan are physical setup components; the Spiders
and Orcs encounter sets remain set aside until the selected branch adds one.
King's Caves deck contains the six original Lost Caves locations; Dragon
Hoard is added to its bottom only at stage 2. Fire-drake and all Dragon Might
cards start set aside. These zones never manufacture additional copies.

The original King's easy recipe omits **one Stone-troll**: its upstream count
is one, while the original scan has no gold removal ring and the original
inventory lists two in both modes. The runtime easy deck restores that one
copy (26 rather than 25). Other physical counts and all standard recipes
remain identical to their frozen inputs.

Printed corrections are confined to the runtime definitions: Stone-troll
cannot have **player card attachments**, rather than the upstream
“non-objective attachments”; Fire-drake's printed threat and defense are
**X**, where X is one more than the number of players, calculated during play;
Haldan's reverse has **2 willpower, 3 attack, 1 defense and 4 hit points**.
The upstream Lost in the Wilderness set label is corrected to **Lost in
Wilderland**. Printed names **Fire-drake**, **Stone-troll**, and **Swarm of Bats** are restored. Objective-locations retain their printed **Forest** trait with a separate `objectiveLocation` annotation. Lost in the Wild’s self-reference, Woodmen Village’s name, Dangerous Crossing’s self-reference, Underground Lake’s “enters play”, and Truly Lost’s location spelling are corrected. Unseen Danger’s shadow bonus lasts until the end of the phase. Original names and additional scan corrections are recorded
in the runtime card JSON while the raw snapshots preserve the supplied
transcriptions.

The Evil Creatures insert requires an independent discard pile **even for
enemies with victory points**. Its empty deck reshuffles only that discard.
Traveling North's encounter Forced is a **Then** clause: adding a creature
requires successfully removing one stage resource. A location entering the
active zone through Deep triggers its “becomes active” effects but is not
another travel and does not resolve travel costs. Forked Passage's response
resolves before Deep. Guarded (enemy/location) discards to the matching type,
adds that physical card without revelation, and reshuffles an empty encounter
deck if necessary.
