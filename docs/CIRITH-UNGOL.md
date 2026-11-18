# The Tower of Cirith Ungol

The first scenario of **The Lord of the Rings: The Mountain of Fire**
(August 2017). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Frodo
Baggins (146001) as the captive Ring-bearer and the box's The One Ring. In The
Lord of the Rings campaign ([SAGA-CAMPAIGN.md](SAGA-CAMPAIGN.md)) its campaign
card attaches A Heavy Burden to the Last of the Company hero and, at stage 3A,
to the Ring-bearer, and Shagrat guards the Item boon each player sets aside:
the players lose the boons he still guards when they win.

## Sources and corrections

- Recipes Q0B.16 and E0B.16 match the scans' set numbers. Each physical copy
  carries its own number, so a scan shows one copy of a design. The Tower of
  Cirith Ungol set runs from The Two Watchers ("1/24" on its location side,
  "2/24" on its enemy side) through Last of the Company (3), Topmost Chamber
  (4), Echoing Passage (5–7), Bloodied Courtyard (8–10), Winding Stairs
  (11–13), Torch-lit Hall (14–16), Shagrat (17), Gorbag (18), Wounded Uruk
  (19–21) to Orcish Howls (22–24). The Orcs of Mordor set holds Orc of Mordor
  (1–3), Snaga Archer (4–6) and Uruk Soldier (7–9, the scan is "8/9"); the
  Deep Shadows set holds Drawn to the Ring (1–3), Deep Shadows (4–5, the scan
  is the gold-icon "5/8") and Evil Vigilance (6–8). Easy mode removes the
  gold-icon copies: Gorbag, two Echoing Passage, an Orc of Mordor, a Drawn to
  the Ring and a Deep Shadows (36 cards in the normal encounter deck, 30 in
  easy). The quantities are recorded in
  `tests/cirith-ungol-source-quantities.json`. The scenario has difficulty 7.
- The immutable snapshot `src/data/pending/the-tower-of-cirith-ungol-import.json`
  has SHA-256
  `b0a348f883148fccc17dcaffbf9ce55d5260cf636490c14de905052f3e01f115`.
- `tests/cirith-ungol-art.json` pins all **26 faces**, checked by eye (Frodo
  from RingsDB, the others from DragnCards). They correct Topmost Chamber
  (unique), Last of the Company ("to choose an enemy", not an Orc enemy),
  Orcish Howls ("each enemy in the staging area"), Deep Shadows ("or reveal an
  encounter card"), the lowercase "either" of Drawn to the Ring, Deep Shadows
  and Evil Vigilance, Gorbag's Forced effect ("it makes an immediate
  attack"), Winding Stairs ("Each player must exhaust a character he
  controls"), Torch-lit Hall ("the just discarded enemy"), The Two Watchers'
  printed threat X and missing quest points, its enemy side ("cancel that
  damage"; engagement 50, threat 2, attack 5, defense 2, 4 hit points,
  Victory 5) and The One Ring's text without the catalog's "Encounter Set:"
  prefix.

## The quest

| Stage                          | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Pass the Two Watchers    | 0            | Setup: Shagrat is set aside; The Two Watchers (location side) and Topmost Chamber join the staging area; the first player loses control of the Ring-bearer, who lies faceup under Topmost Chamber as a guarded objective, and attaches Last of the Company and The One Ring to a hero he controls. Each non-unique location gets -1 threat and cannot leave the staging area. While The Two Watchers is in the staging area (enemy side), it is considered to be engaged with each player. The stage cannot be defeated while The Two Watchers is in play. |
| 2A/2B Fighting in the Tower    | 18           | When Revealed: the encounter discard pile is shuffled into the deck, which is discarded until X enemies (X players): they join the staging area. Forced: at the beginning of the quest phase, the deck is discarded until an enemy; a copy of it in the staging area is discarded too, else the enemy joins the staging area. The stage cannot be defeated unless Topmost Chamber is in the victory display; when the Ring-bearer is free of encounters, the first player gains control of him.                                                            |
| 3A/3B Escape from Cirith Ungol | 12           | When Revealed: Last of the Company joins the victory display; The One Ring is attached to the Ring-bearer, who exhausts; The Two Watchers returns from the victory display to the staging area (location side); each other player reveals an encounter card. No travel to The Two Watchers before 12 progress here; its enemy side gets +3 threat and +3 defense and is considered engaged with each player. The stage cannot be defeated while The Two Watchers is in play; defeating it wins.                                                            |

**Last of the Company** (objective attachment): the attached hero gains the
Ring-bearer trait and the Fellowship sphere; its controller cannot lose the
first player token. Action: exhaust The One Ring and raise your threat by 1 to
choose an enemy: until the end of the phase it gets -X threat, X being the
attached hero's willpower.

## Encounter cards

| Card               | Behaviour                                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Two Watchers   | Unique, immune to player card effects. Location side: threat X (twice the stage number), no quest points; after the players travel there it flips to its enemy side in the staging area. Enemy side: cannot be optionally engaged; its damage is canceled and raises the defending player's threat instead. |
| Topmost Chamber    | Unique, immune, Victory 2. No travel unless there is at least 18 progress on stage 2B. Travel: Shagrat joins the staging area.                                                                                                                                                                              |
| Echoing Passage    | +1 threat for each enemy in the staging area; while active, each enemy gets +2 defense.                                                                                                                                                                                                                     |
| Bloodied Courtyard | Travel: each player raises his threat by 1. While active, an enemy that enters the staging area takes 1 damage.                                                                                                                                                                                             |
| Winding Stairs     | Travel: each player exhausts a character he controls. While active, each enemy in the staging area gets +10 engagement cost.                                                                                                                                                                                |
| Torch-lit Hall     | After the players travel there, 2B's search: discard until an enemy; its copy in the staging area is discarded too, else it joins the staging area.                                                                                                                                                         |
| Shagrat            | Unique, Victory 4. No non-boon attachments, no non-combat damage; allies cannot attack or defend against him. After progress is placed on the quest, -X engagement cost until the end of the round.                                                                                                         |
| Gorbag             | Unique, Victory 3, no attachments. After he engages you, he makes an immediate attack. Shadow: an additional attack after this one.                                                                                                                                                                         |
| Wounded Uruk       | Enters play with 2 damage; after it engages you, +2 attack until the end of the round. Shadow: +1 attack for each damage on the attacker.                                                                                                                                                                   |
| Orc of Mordor      | Surge; after it engages you, exhaust a character you control. Shadow: exhaust a character you control.                                                                                                                                                                                                      |
| Snaga Archer       | Archery 2; after it engages you, 2 damage to a character you control. Shadow: +1 attack (+2 if the defending character is damaged).                                                                                                                                                                         |
| Uruk Soldier       | After it engages you, raise your threat by 2. Shadow: +1 attack; if the attack destroys a character, the attacker returns to the staging area.                                                                                                                                                              |
| Orcish Howls       | 1 damage to each enemy in the staging area; until the end of the phase each enemy gets +1 threat for each damage on it; surge with no enemy in the staging area. Shadow: the attack resolves against another enemy engaged with you.                                                                        |
| Drawn to the Ring  | The first player exhausts The One Ring and reveals an encounter card, or discards until an enemy that is put into play engaged with him. Shadow: discard a non-objective attachment you control.                                                                                                            |
| Deep Shadows       | Doomed 2. Each player discards his hand (at least 3 cards) or reveals an encounter card. Shadow: an additional attack after this one.                                                                                                                                                                       |
| Evil Vigilance     | Each player discards a questing character or raises his threat by 1 for each questing character he controls. Shadow: +1 attack; if the attack destroys a character, the top card of the encounter deck is revealed.                                                                                         |

**Frodo Baggins** (146001, Fellowship hero, 0 threat, 2/1/2/2): Planning
Action: exhaust The One Ring to add 1 resource to a hero's pool. It is
scripted in `src/game/mountain-fire-player-cards.ts` with the box's other
player cards to come.

Interpretations:

- **The Ring-bearer's capture**: the Saga places Frodo with The One Ring under
  the first player's control; 1A's setup takes him out of play under Topmost
  Chamber and holds The One Ring until the opening hands are kept, when the
  first player chooses the hero for Last of the Company and The One Ring. The
  Saga's loss when The One Ring leaves play applies from then on. The captive
  cannot be claimed; he returns to the first player when Topmost Chamber
  leaves play, without resources, damage or attachments.
- **The One Ring** stays with the hero carrying Last of the Company until 3A;
  that hero is the Ring-bearer for the Saga, so if he leaves play the players
  lose. Frodo's Planning Action pays its cost with The One Ring wherever it is
  attached, by the player who controls it. Once Last of the Company is in the
  victory display, Frodo follows the first player token as in the other Saga
  scenarios. If Frodo is not in play at 3A, The One Ring stays where it is.
- **Last of the Company's Action** is an encounter card's ability: it can
  choose The Two Watchers, which is immune only to player card effects.
- **The Two Watchers** is one physical card: its enemy side keeps the card's
  identity, and its victory display entry returns as the location at 3A. Its
  location side made active by any means flips at once, since it has no quest
  points. While considered engaged it attacks each player and is dealt a new
  shadow card for each attack; each player may attack it once per round. Its
  combat damage to any character is replaced by the threat raise; with a
  blank text box it deals damage normally.
- **1B's non-unique locations** cannot be travelled to, discarded or explored
  while 1B is in effect: a location with progress equal to its quest points
  stays in the staging area with its tokens.
- **Discarding until an enemy** (2A, 2B, Torch-lit Hall, Drawn to the Ring):
  the discard pile is shuffled back once when the deck runs out; with no
  enemy found nothing happens. A "copy" is an enemy with the same title in
  the staging area; both go to the discard pile without being defeated.
- **"Either … or …"** offers an option only when it can change the game; with
  one left it resolves alone. Deep Shadows offers the hand only with at least
  3 cards in it; Evil Vigilance needs a questing character.
- **Archery** from the staging area (Snaga Archer) is assigned at the
  beginning of the combat phase, as for every archery keyword in the engine.

## Engine

- A `cannotExplore` scenario hook keeps a location with enough progress in
  play (1B's non-unique locations); `cannotLeave` already stops other ways of
  leaving the staging area.
- Last of the Company is an objective attachment with a scenario ability; it
  grants the Ring-bearer trait and a Fellowship resource icon through the
  expansion passives.

## Verification

```sh
npm run test:engine
npm run test:cirith-ungol-simulation
npm run build
npm run test:browser-cirith-ungol
npm run audit:rules
```

The focused suite (`tests/cirith-ungol.test.ts`, 15 tests) covers setup in one
to four players and both difficulties with the captive Ring-bearer and the
choice of hero, the loss when The One Ring leaves play, the first player
token, 1B's locations and travel, The Two Watchers' flip, considered
engagement, attacks and damage cancellation, 2A's enemies, 2B's quest-phase
search and copies, Torch-lit Hall, Topmost Chamber's travel limit, Shagrat and
the freed Ring-bearer, 3A, 3B's travel limit, bonuses and the win, Last of the
Company's Action, Frodo's Planning Action, every location, enemy, treachery
and shadow, and Snaga Archer's archery. The source test pins the snapshot, the
quantities and set numbers, the corrections and all 26 faces.

The complete-game matrix plays fourteen games from setup (one to four players,
and hidden, decisions and all review modes, in both difficulties) with exact
save restoration after every action, physical conservation (the captive, Last
of the Company and The One Ring before they are attached, the set-aside
Shagrat, the treacheries being resolved and both faces of The Two Watchers as
one card) and private-view checks: the players travel to The Two Watchers and
destroy them in every game. Two late-game matrices start twelve games each at
Fighting in the Tower with 18 progress, just after the travel to Topmost
Chamber with Shagrat engaged (Shagrat fights in every game and the Ring-bearer
is freed into 3A in most), and at Escape from Cirith Ungol with 12 progress and
The Two Watchers flipped (11 of the 12 games win).

The browser suite runs eight native setups with exact physical inventories
and shows the printed quest cards (1 and 3, both sides), the setup choice,
each stage's panel, The Two Watchers' flip and attack, 2A, 2B's search,
Topmost Chamber with Shagrat, the freed Ring-bearer, 3A, 3B's flip, Last of
the Company's Action, Frodo's Planning Action, every treachery, Winding
Stairs, Bloodied Courtyard, Torch-lit Hall, Gorbag's immediate attack,
Shagrat, the Orcish Howls and Drawn to the Ring shadows, the victory and the
loss of The One Ring at 1280/390/320px; it checks all 26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
