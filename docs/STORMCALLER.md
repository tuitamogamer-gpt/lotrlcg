# Flight of the Stormcaller

The original Adventure Pack is implemented with all eleven player designs and
the original standard/easy adventure for solo and 1–4 players in local hot-seat.
Its revised Dream-chaser campaign and Nightmare variants remain reference
content. The next chronological import is The Thing in the Depths.

## Sources and rules

- [Immutable snapshots, printed corrections, physical recipes and artwork](STORMCALLER-SOURCES.md)
- [Pursuit, physical setup, encounter effects and victory/loss](STORMCALLER-RULES.md)
- [All eleven player-card implementations](STORMCALLER-PLAYER-SCRIPTS.md)
- [Effective threat and direct ship-controller elimination](STORMCALLER-THREAT-AUDIT.md)
- [Shared Sailing, Heading, ships and Boarding](GREY-HAVENS-SAILING.md)

The pack has eleven original player designs, including two already implemented
designs, and seven quest designs: four player stages and three pursuer stages.
Its 27 encounter/objective definitions reuse sixteen existing identities and
add eleven. One rulesheet reference remains outside gameplay registration.
The pinned reference catalog and scenario recipes are unchanged. Separate
promoted definitions correct the printed stage-3C search, Raging Squall's
Weather trait and Stormcaller's title, with scan provenance retained.

The runtime contains 520 player definitions, 59 heroes, 460 ordinary deck
cards, one encounter ally, 694 encounter definitions and 49 scenarios.
`npm run audit:rules` resolves 1,374 of 4,183 reference identities and 98 of 355
recipes; 2,809 reference identities remain pending. These counts describe
implemented registration, with gameplay checks recorded separately.

## Integration and verification

Scenario selection, the printed current quest faces, pursuer area and physical
pile counters, fleet, action controls and saved choices use the implemented
runtime. Future quest and Corsair identities remain private. The additive
account-choice migration is tested locally; no hosted database change is made
by the import.

Use Node 22 and `npm ci`:

```sh
npm run check
npm run test:engine
npm run audit:rules
npm run test:stormcaller-simulation
npm run test:stormcaller-multiplayer
npm run test:browser-stormcaller
```

The dedicated simulation suite runs 32 complete standard/easy trajectories:
1–4 players with immediate, all, hidden and decisions review modes. Its 24
comparisons require identical final rules state, no pending review and
save/restore after every action. The separate multiplayer group covers 64
complete games: two difficulties, four player counts and eight seeds. The
standard scenario registry adds five registrations to the 254-case sharded
manifest; its unsupported campaign registration reports a skip.

CI retains the three Grey Havens parity jobs and adds a dedicated Stormcaller
parity job, a fifteenth multiplayer group and a sixth browser group. Browser
jobs serve the engine job's production build artifact. Client evidence records
the bundle entry, actual controls, save/reload, images and responsive layouts.
Complete starter-deck simulations verify legal state, serializability and
termination; they do not establish strategy or exhaustive rules compliance.

The existing core revisions browser setup now handles mandatory opening
choices before keeping the hand. A reproducible Hunt for Gollum seed-27 setup
proved the former timeout: False Lead remained a real mandatory choice after
presentation reviews ended. The existing opening helper resolves that choice;
both deterministic and ordinary core revision journeys pass with their
original assertions.
