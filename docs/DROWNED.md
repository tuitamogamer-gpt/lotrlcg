# The Drowned Ruins

This import covers the ten original Adventure Pack player designs and the
original standard/easy adventure for solo and 1–4 players in local hot-seat.
Dwarven Sellsword, Woodland Courier and Strider reuse existing implementations,
so the pack adds seven player definitions.
The revised Dream-chaser campaign and the Nightmare Deck are described in
their own rules. The next chronological Adventure Pack is A Storm on Cobas
Haven.

## Sources and physical cards

The immutable reference catalog and scenario recipes remain unchanged.
[Original sources and scan corrections](DROWNED-SOURCES.md) document the
printed rulesheet, both faces of each double-sided location, and the scoped
runtime corrections. The original pack contains 28 player cards, 30 encounter
cards and two quest cards. Shared encounter cards and the two companions come
from The Grey Havens.

[Player rules and interactions](DROWNED-PLAYER-SCRIPTS.md) cover all ten designs,
including Battle-fury's attack and optional commitment, physical Remedy transfers,
and Interrogation's ordered encounter-deck inspection.

| Physical zone                | Standard | Easy |
| ---------------------------- | -------: | ---: |
| Encounter deck               |       30 |   21 |
| Grotto deck                  |        8 |    8 |
| Shrine to Morgoth, set aside |        1 |    1 |
| Captain Sahír and Na'asiyah  |        2 |    2 |
| Quest deck                   |        2 |    2 |
| Total gameplay cards         |       43 |   34 |

## Adventure

Grotto locations preserve their physical front/back pairing. Their visible
fronts use generic identities and artwork paths, so inspecting a face does
not reveal its hidden Underwater reverse. The top Grotto face and remaining
pile size are public. A shuffled Grotto pile receives fresh public handles so
previously revealed reverses cannot be tracked through its shuffle. Flipping
preserves the physical pairing and attachments, and removes progress except
when the Shrine's beginning-of-quest Forced effect explicitly preserves it.

The optional flip/return after an Underwater location's “Then” clause requires
the preceding damage, resource loss, character discard or deck discard to
resolve in full. Powerful Undertow prevents flipping the active location for
the remainder of the round, including a newly active location.

The first quest needs both 15 progress and three Underwater locations in
the victory display. Sahír's betrayal introduces Shrine to Morgoth, his
immediate attack and each player's Undead search. The Shrine prints Victory 5
and the same win clause on both faces, so exploring either face places it in
the victory display and wins while that clause is active. This applies the
printed keyword and Golden Rule; it is not an explicit exception in the MEC51
rulesheet's general Grotto recycling paragraph. Losing a required objective
ally loses the game while its loss clause is active. The table displays
these goals, current Underwater play restrictions, the Grotto pile, companions
and Powerful Undertow's round-long flip restriction.

Scenario choices use the ordinary decision controls and are included in
saved games. The local account migration adds the scenario to saved fellowship
choices and is checked with the existing ownership/RLS suite; it is not a
hosted database migration.

## Nightmare mode

The Nightmare Deck (recipe `N06.7`,
[rules and cards](NIGHTMARE.md#the-drowned-ruins-nightmare)) removes a Cursed
Caverns / Twisting Hollow and an Undersea Grotto / Dark Abyss from the Grotto
deck (named by both sides' titles) and 14 cards from the encounter deck. Its
four Grotto locations, two Overgrown Passages and two Sharp Precipices, join
the Grotto deck: each shows a generic shared Grotto side, so its Underwater
side (Jagged Cavern or Submerged Crawlway) stays hidden until it flips, and
save validation expects the Nightmare Grotto deck's 10 physical cards. Sharp
Precipice flips as the players travel to it, without a choice. The new
Underwater sides' and Flooded Caverns' end-of-quest Forced effects use the
scenario's Then receipts: a flip or Flooded Caverns' return to the staging
area follows only when every player's discard, search or return resolved.
While the active location is Underwater, encounter card effects cannot be
canceled, and at stage 2A Captain Sahír attacks each player in turn order.
Great Shark shares Cave Eel's engagement rule and its return at the beginning
of the encounter phase. Focused checks are in
`tests/nightmare-drowned.test.ts`.

## Verification

Use Node 22 and `npm ci`:

```sh
npm run check
npm run test:engine
npm run audit:rules
npm run build
npm run test:drowned-simulation
npm run test:drowned-multiplayer
npm run test:browser-drowned
```

The review suite covers 32 complete standard/easy game trajectories across
one to four players and all event-review modes, with restoration after every
action and equality of final rule states. Its observer checks physical card
conservation and hidden reverse privacy. The multiplayer group adds 64 games
across both difficulties, four player counts and eight seeds. Dedicated rules
and browser fixtures exercise victory through the actual game controls.

CI retains the earlier suites and adds Drowned Ruins review parity,
multiplayer and responsive browser groups. Every browser group consumes the
engine job's production build artifact.
