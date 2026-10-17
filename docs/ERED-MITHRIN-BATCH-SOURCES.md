# Original Ered Mithrin Adventure Pack sources

Checked 17 October 2026. This batch covers the original MEC66–MEC69
Adventure Packs: **The Withered Heath**, **Roam Across Rhovanion**,
**Fire in the Night** and **The Ghost of Framsburg**, in original standard
and easy mode. Later campaign and Nightmare material are excluded.

The publisher's [original product support page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/)
links all four original two-page inserts below. Each PDF was downloaded,
hashed and read; copies and extracted text are cached under the ignored
`output/ered-release/sources/` directory. The import CLI does not yet attach
these four inserts to `sources.expansionRules`. The immutable snapshots
retain that omission; the verified links are recorded here separately.

| Original rules insert | Bytes | SHA-256 | Printed difficulty |
| --- | ---: | --- | ---: |
| [MEC66: The Withered Heath](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec66_the_withered_heath_rules-insert-compressed.pdf) | 3,144,732 | `51c3f1a1e1c5546cea5bf81fb2e1f5eaa18ab8c40d2741a79a11b182339951b7` | 6 |
| [MEC67: Roam Across Rhovanion](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec67_roam_across_rhovanion_rules-insert-compressed.pdf) | 3,151,973 | `a5f649f4bcda1c9d43d44f487a3b67f8b2f758502dfc88c594de95893700da2d` | 5 |
| [MEC68: Fire in the Night](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec68_web_fire_in_the_night_rules.pdf) | 3,338,495 | `873e08835bd5b0769485a0b1ffec0247cd6c434c3b7139e9958f9699066f7aff` | 7 |
| [MEC69: The Ghost of Framsburg](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec69_web_the_ghost_of_framsburg_rules.pdf) | 2,766,475 | `c6f6060e32f4a6f4a2abdb6ff81b7fac1935be28152097c093a99a549f263839` | 5 |

The previously pinned [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
was read for the relevant general attack rules (14,383,996 bytes, SHA-256
`a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`).
Section 1.28, PDF page 7, gives a shadow at the beginning of an attack
outside combat and discards it after the attack. Section 1.42, PDF page 8,
discards previously dealt shadows before dealing a new shadow for an
additional attack. Section 1.50, PDF page 9, distinguishes considered
engagement from physically engaging; it does not exempt a staged enemy's
attacks from shadow resolution.

All four source bundles were produced with
`prepare-scenario-import.mjs --recipe Q08.X --download`, serialized with
`flock /tmp/lotr-scenario-import.lock`. Each artwork entry preserves its
original DragnCards URL, OCTGN UUID, local path, byte count and SHA-256.
Every original scenario face was visually read. The four snapshots contain
**94 distinct physical card identities and 109 distinct faces**: **69 new
pack identities with 84 faces**, plus **25 reused Wilds of Rhovanion
identities/faces**. Roam's two objective allies have enemy reverses; those
reverses are views of the same physical cards, not additional copies.

The **40 original player designs** also have separate local original scans,
downloaded by their preserved OCTGN UUIDs to `public/cards/{code}.jpg`.
Their immutable source inventory is
`output/ered-release/player-art-pins.json` (40 faces, 6,170,989 bytes).
Scenario and player contact sheets are kept in the ignored source cache.
All seven player contact sheets were visually read. Familiar Lands refers
specifically to a **player card attachment**, a restriction omitted by the
catalog transcription. Man the Walls refers to the **first ally played**
by each player after its effect. Ring of Thrór retains that printed title
in its self-reference, correcting the catalog's “Thrór's Ring.” See
[the player implementation notes](ERED-MITHRIN-PLAYER-SCRIPTS.md).

| Immutable input | SHA-256 |
| --- | --- |
| `public/catalog.json` | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json` | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json` | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `pending/the-withered-heath-import.json` | `ac7658e6ac9647f08bd44357f46bf47c531e806e7520a6b7fe6d2a9af7f3f02c` |
| `pending/roam-across-rhovanion-import.json` | `476da4190520f7ca1328eedceb29a1a257bfa4b14f47b1ad44ddcb4a991796f0` |
| `pending/fire-in-the-night-import.json` | `c27ab70328587ad495a1c20b2e01c449953212a3ef3744b56d6c227c8e840ed2` |
| `pending/the-ghost-of-framsburg-import.json` | `ceaaffbfc9b4428f094f1ee6018473bbe38c781c6572c88a46fd5443219cbeb0` |

The physical quantities were independently checked against Hall of Beorn's
original inventories: [Heath](https://hallofbeorn.com/LotR/Scenarios/The-Withered-Heath),
[Roam](https://hallofbeorn.com/LotR/Scenarios/Roam-Across-Rhovanion),
[Fire](https://hallofbeorn.com/LotR/Scenarios/Fire-in-the-Night), and
[Ghost](https://hallofbeorn.com/LotR/Scenarios/The-Ghost-of-Framsburg).
Only Normal and Easy columns are used; a dash means zero. The table below
records corrected original physical quantities. Setup still resolves the
printed card effects, including each player's actual location selection.

| Original recipe | Quest cards | Encounter pool before setup | Auxiliary deck | Setup components | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Q08.4 / Heath standard | 4 | 37 | 6 Caves | 5 set aside | 52 |
| E08.4 / Heath easy | 4 | 26 | 6 Caves | 5 set aside | 41 |
| Q08.5 / Roam standard | 5 | 40 | — | 4 objective cards | 49 |
| E08.5 / Roam easy | 5 | 26 | — | 4 objective cards | 35 |
| Q08.6 / Fire standard | 1 | 37 | 8 side quests | 1 Dagnir | 47 |
| E08.6 / Fire easy | 1 | 25 | 8 side quests | 1 Dagnir | 35 |
| Q08.7 / Ghost standard | 3 | 41 | — | 1 Cursed Tomb | 45 |
| E08.7 / Ghost easy | 3 | 29 | — | 1 Cursed Tomb | 33 |

Ghost's frozen recipes divide the non-quest pool into a deck and five
preselected location copies. The printed setup instead has each player
choose a different location from the actual encounter pool. Both pools
above include those physical locations; setup moves only the selected
copies into staging.

Two easy quantities require runtime corrections. Fire retains **three
The Dragon's Thrall** in both modes, while the raw easy recipe has one;
restore two copies. Ghost has **one Crypt Stalker** in easy mode, while the
raw easy recipe has two; remove one copy. Terrible Shadows is correctly
two in standard and zero in easy. All other original physical quantities
agree. Raw source files and pending snapshots remain unchanged.

Printed corrections belong only in promoted runtime records:

- Heath stage 2B says damage equal to Cold-Drake's **hit points** and names
  **Cold-Drake**, not the upstream “quest points”/“Ice Drake.” Dragon
  Hatchling's main bonus is **threat and attack** per Dragon Sign; its
  shadow separately increases attack and defense. High Falls has printed
  threat **X**. Stage 4A adds the **set-aside** Cold-Drake. Snow-troll's
  shadow specifies the attacking **enemy** makes the additional attack.
- Roam's raw **Urdug and Tiny enemy reverse texts are swapped**. Urdug is
  Indestructible and makes the quest-phase attack; Tiny prevents damage
  to Urdug and follows Urdug into engagement. Urdug's enemy stats are
  15 engagement, 2 threat, 3 attack, 2 defense, 5 hit points. Tiny's are
  50, 1, 6, 3, 9, with victory 6. Their objective-ally willpower values
  are 2 and 1 respectively. Hills of Wilderland has **X threat and X
  quest points**. Pack of Wargs has the missing return-to-staging shadow.
- All eight Fire side quests have **victory 10**. Defend the Town,
  Draw Her Fire and Rout the Goblins have **5 printed quest points**;
  the other five have 10. Rout the Goblins has the missing clause
  “gets +5 quest points for each Goblin enemy in play.” Dagnir has
  **X threat and victory 5**; Burning Watchtower has **X threat**.
  Powerful in Wrath's self-reference is “Wrath.”
- Ghost's Forgotten Crypt has **victory 2**, The Cursed Tomb **victory 5**,
  Evil Spectre **35 engagement**, Crypt Stalker **X threat** and Hidden
  Staircase **X threat**. Haunted Hall's self-reference is Haunted Hall.
  Moonlit Passage has the missing shadow “Raise your threat by 1.”
  Slammed Shut says “chooses and exhausts.”
- Reused source labels retain their original upstream text in the
  snapshots. Runtime names restore **Lost in Wilderland**, **Stone-troll**
  and **Swarm of Bats**. Stone-troll prohibits **player card attachments**.
  Previously verified shared encounter rules remain reused by identity.

The original inserts establish source-specific rules that must be kept
separate from later campaign additions. Heath creates the Caves deck from
the six Lost Caves cards. Deep discards the traveled-to location and makes
the top Cave the active location; an empty Caves deck disables Deep.
If a Dragon Sign is drawn this way, put it in staging and resolve its
Guarded keyword. Creature Den's travel response instead attaches its
searched Dragon Sign directly as a guarded objective. Stage 2 ignores
Deep, retains Cold-Drake in staging despite lethal damage and caps damage
at six per round/eighteen total. Stage 3 preserves damage while setting
the same Cold-Drake aside, then removes three damage each round.

Roam's insert repeats the Encounter keyword: up to three encounter-backed
player cards per player start set aside, outside the minimum deck size;
they enter the encounter deck only by an explicit card effect. Their
revelations cannot be canceled. A shadow copy goes to the encounter
discard pile; an in-play copy that leaves play is removed from the game.
Indestructible does not discard an enemy when damage reaches its hit
points. Urdug's printed stage-3 victory therefore checks zero remaining
hit points, rather than requiring his destruction.

Fire's side quests are encounter and quest cards; their revelation effects
cannot be canceled by player card effects. The first player chooses the
current quest at the beginning of the quest phase. Excess progress never
spills onto another quest. Dagnir's printed limit applies to **non-quest
effects** each round; Face the Dragon's damage comes from a quest card.
Hrogar's Hill attacks use its explicit defender/overflow rules and omit a
shadow card only where the printed main quest says so.

Ghost resolves Discover in order: look at X encounter cards; choose one
Loot objective to attach to the active location as guarded; randomly
choose one Hazard card to reveal and add to staging; discard the rest.
If fewer than X cards remain, shuffle the encounter discard pile into
the deck and continue. Loot enters play only through Discover (or an
explicit printed override such as Forgotten Crypt); normal revelation
discards Loot and reveals another card. Discover triggers when a location
becomes active, including replacement effects, and does not itself pay
or repeat a travel cost.
