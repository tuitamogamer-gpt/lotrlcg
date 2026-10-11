# The Thing in the Depths

This import covers all nine original Adventure Pack player designs and the
original standard/easy adventure for solo and 1–4 players in local hot-seat.
The revised Dream-chaser campaign and Nightmare variants have separate support
gates. The next chronological Adventure Pack is Temple of the Deceived.

## Sources and rules

- [Original source records, printed corrections, recipes and artwork](DEPTHS-SOURCES.md)
- [Scenario implementation and printed rules](DEPTHS-RULES.md)
- [Original player-card implementations](DEPTHS-PLAYER-SCRIPTS.md)
- [Independent scenario rule audit](DEPTHS-AUDIT.md)

The original pack contains nine player designs, three quest designs and fifteen
new encounter identities: 25 player cards, three quest cards and 32 encounter
cards, totaling 60 physical cards. The scenario uses 21 encounter identities,
reusing six Grey Havens cards. Two additional objective-ally reverse definitions
represent the same physical Captain Sahír and Na'asiyah cards; they add no
recipe copies. Every source identity is a gameplay card.

The standard recipe has 20 main-deck cards, 18 reserved beast-deck cards,
Helm of the Stormcaller and one Umbar Raider in staging, the boss and two
Captains set aside, and three quests. The easy recipe has
13 main-deck cards, 16 beast-deck cards and the same other zones. The source
snapshot retains these exact quantities. Twenty-nine scenario faces and nine
player scans form 38 unique local images, with eight existing scans reused.
The pinned reference catalog and scenario recipes remain unchanged.

Grapple uses the specified location's printed statistics, attaches the same
enemy facedown, adds two threat to its host and detaches when that location
becomes active or is explored in staging. The scenario includes the two-sided
Captains, encounter-set removal during the transition, the beast's reserved
deck, stage-three active-location replacement, its Ship threat deadline and
the boss's encounter-source damage from destroyed Creatures.

The regenerated registration inventory contains 528 player definitions (60 heroes,
467 deck cards and one Encounter ally), 711 encounter definitions and 50 scenario
designs. It resolves 1,400 of 4,183 reference identities and 100 of 355 setup
recipes; 2,783 identities remain pending. Synthetic reverse definitions do not
add physical recipe cards or extra original source identities.

## Integration and verification

The dedicated review suite is designed to run 32 complete standard/easy
trajectories: 1–4 players with immediate, all, hidden and decisions review modes.
Its 24 comparisons require identical final rules state, no pending review and
JSON save/restore after every action. The separate multiplayer group covers
64 complete games: two difficulties, four player counts and eight seeds. Eight
fresh immediate baselines cover both difficulties and all four player counts.

The ordinary scenario registry adds five simulation registrations. Its
unsupported campaign registration reports a skip. CI retains every existing
group and adds dedicated Depths review parity, a sixteenth multiplayer scenario
and a seventh browser group, for 33 jobs. Browser groups serve the production
build artifact from the engine job.

Use Node 22 and `npm ci`:

```sh
npm run check
npm run test:engine
npm run audit:rules
npm run test:depths-simulation
npm run test:depths-multiplayer
npm run test:browser-depths
```

The final full engine run passed 3,609 checks with no failures; TypeScript and
the production build also passed. The final focused selection passed 106 checks: 40 for the scenario, sixteen
for its independent audit, 38 for player cards and twelve for integration.
Lanwyn required Response windows after actual revelations with gained or
conditional Surge on eighteen existing encounter identities across twelve
prior scenario modules. The 23 Surge checks passed, including multiple Surge
instances and repeated When Revealed effects that do not reveal the card again.

The official FAQ 1.57 correction uses the actual threat dial for elimination
under Vanish from Sight, while card effects and engagement use treated threat.
Favor of the Valar resolves before controller-loss checks. The focused
Stormcaller selection passed 110 checks and the affected legacy selection
passed 383 checks, including saved remote controllers and variable limits.

The local matrices passed: eight fresh baselines with 915 restored actions,
32 complete review-mode games with 24 comparisons of identical final rules
state, and all
64 seeded hot-seat games with 9,081 restored actions. The two shard-manifest
checks also passed. All 104 game runs ended in losses under the simple
policy for Core learning decks. These simulations check legal state, serializability
and termination; they do not establish strong strategy or exhaustive rules
compliance.

These local games loaded an immutable snapshot of rules and tests captured at
2026-10-11 18:55:43.998 UTC under Node 22.23.3. Its manifest records 529 exact
file hashes. Later Captain routing/lifecycle, combat, Forced-effect timing and Surge refinements are
separate from that loaded snapshot. `output/depths-simulation/report.json`
records every changed or added rules/test file and explicitly reports that
the captured runtime differs from the final live source; logs are retained
in the same directory. The 33 CI jobs on the final source, including both complete
Depths matrices, must pass before merge. The frozen production build passed 264 browser checkpoints: 156 scenario
checks, 105 player UI checks and three all-nine-player-art checks. The scenario
checks also inspect all 29 original faces at each width (87 face assertions).
All three widths passed with zero browser errors. Local browser reports
bind the uncommitted build entry; canonical verification additionally binds
the published main commit.
