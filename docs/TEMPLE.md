# Temple of the Deceived

This import covers all ten original Adventure Pack player designs and the
original standard/easy adventure for solo and 1–4 players in local hot-seat.
Ered Luin Miner already had an implementation, so the pack adds nine player
definitions. The original pack contains 60 physical cards. Revised Dream-chaser
campaign and Nightmare variants retain
separate support gates. The next chronological Adventure Pack is
The Drowned Ruins.

## Sources and setup

- [Original source records, printed corrections, recipes and artwork](TEMPLE-SOURCES.md)
- [Scenario implementation and printed rules](TEMPLE-RULES.md)
- [Published-content provenance](CONTENT-IMPORT.md)

The original MEC50 rulesheet gives the scenario difficulty as 4. The retained
preparation snapshot contains 27 original scenario reference identities:
25 gameplay identities and two rulesheet proxies. Runtime recipes omit those
two proxies from set aside and restore the fourth printed copy of Deeper into
the Ruins, omitted by the upstream quantity. Printed encounter indices 19–22,
followed by Furious Rainstorm at 23, establish that correction; the immutable
source retains its quantity of three. Objective-ally reverse definitions for Captain
Sahír and Na'asiyah, and the two shared Uncharted fronts, represent existing
physical cards; they add no recipe copies. The pinned reference catalog and
recipe files remain unchanged.

| Zone                                      | Standard | Easy |
| ----------------------------------------- | -------: | ---: |
| Encounter deck                            |       32 |   25 |
| Fixed Island Map                          |       15 |   15 |
| Set aside: Guardian, Key and two Captains |        4 |    4 |
| Quest deck                                |        1 |    1 |
| Physical gameplay cards                   |       52 |   45 |

The map has three rows and five columns. Twelve Lost Islands occupy the first
four columns; the final column contains two Temple Halls and The Grotto's
Entrance beneath their shared Temple front. Setup flips the upper-left and
lower-left locations without resolving their Forced effects, then the first
player chooses which is active. The two Captains join the first and last
players. Temple Guardian enters staging with the guarded Gate Key.

The shared fronts use neutral artwork URLs. Each remains a scan of the
printed card while its URL and public identity conceal the private reverse.
The import retains forty original scenario face scans and ten verified player
faces: nine JPEGs and Armored Destrier's PNG. The two neutral aliases bring the
artwork inventory to 52 local paths. Ered Luin Miner's cached face is its
original printing; the source notes separately retain its verified revised
printing and current erratum.

## Map and card rules

Locations keep their fixed positions and physical identities throughout the
game. Orthogonally adjacent locations count as staging; other map locations
remain in play outside staging. Jagged Cliffs excludes the location to its
right from staging, while Winding Caverns permits its printed wider travel
range. Reaching printed quest points does not remove a map location. Leaving
the active location explores it and clears its progress; flipping a location
also clears its progress. Ordinary travel and progress effects use these
scenario rules.

Actual map travel offers Curious Brandybuck, Ever My Heart Rises and Strength
of Will their printed responses. Ancient Mathom responds when a location is
explored on departure; Elf-stone requires the location to leave play and
therefore does not respond. Attachments controlled by an eliminated player
are discarded even on map locations outside staging.

The Gate Key must be exhausted to travel to an unrevealed Temple. Destroying
Temple Guardian frees the same physical Key and retains the Guardian in the
victory display; Temple Halls or the grotto can return that Guardian to play.
An exhausted Key stays exhausted when its hero leaves play and it returns to
staging with the same physical identity.
The players win when the eighth progress is placed on the revealed grotto,
including legal player-card progress while it is outside the active slot.

The original grotto scan has no player-effect immunity. The promoted runtime
definition corrects that upstream transcription error; the source snapshot
preserves it. Its shared Temple front remains immune. The scenario also
implements each encounter and shadow clause, conditional Doomed, Soulless
Cadaver's search restriction, Cursed Temple's refresh restriction, the
Captains' resource choices and Forced effects, and their physical leave-play
and control rules.

| Player design         | Implemented behavior                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Elfhelm               | Mount bonuses use each hero's applicable resource spheres.                                                       |
| Ceorl                 | Any player can pay the Spirit cost, ready him and offer control once per phase.                                  |
| Armored Destrier      | The defense Response readies its hero, then discards a shadow from another engaged enemy.                        |
| Déorwine              | While defending, any player can pay the Leadership cost to cancel the triggered shadow effect.                   |
| Revealed in Wrath     | The Noldor-gated action blanks a non-unique enemy's printed text while preserving Traits.                        |
| Rhovanion Outrider    | Its quest Response places actual staging-location progress and grants the conditional willpower bonus.           |
| Scouting Party        | Its post-commit Response checks the controller's complete, nonempty Scout fellowship.                            |
| Entangling Nets       | The unattached Trap waits in staging and attaches to the next eligible entering enemy.                           |
| Arrows from the Trees | The encounter action follows all engagement checks and offers the shared Tactics payment after its first damage. |
| Ered Luin Miner       | Its existing deck-discard Response puts the same physical card into play once.                                   |

Déorwine's original scan grants an **Action**. The pinned current RingsDB
record marks errata and grants a **Response**, which matches the implemented
shadow-cancellation timing. The source notes distinguish the original scan,
current catalog correction and attributed designer clarification. This import
does not claim a card-specific official FAQ entry or verified revised scan for
that timing correction.

## Integration and verification

The registration inventory contains 537 player definitions: 61 heroes,
475 deck cards and one Encounter ally. It also registers 727 encounter
definitions and 51 scenario designs. It resolves 1,424 of the 4,183 reference
identities and 102 of 355 setup recipes; 2,759 identities remain pending.
These counts describe registration. Semantic tests, complete games and actual
client interactions provide separate evidence.

The dedicated review suite runs 32 standard/easy game trajectories: 1–4
players with immediate, all, hidden and decisions review modes. Its
24 comparisons require identical final rules state and restoration after
every action. The observer checks physical map conservation, fixed positions,
public projections and private reverses. The multiplayer group runs 64 games:
both difficulties, four player counts and eight seeds. The ordinary solo
registry adds five cases, including a separately skipped unsupported campaign
case, bringing the preserved shard manifest to 264 registrations.

CI retains all 33 previous jobs and adds Temple review parity, a seventeenth
multiplayer scenario and an eighth browser group, for 36 jobs. Browser groups
use the engine job's production build artifact.

Use Node 22 and `npm ci`:

```sh
npm run check
npm run test:engine
npm run audit:rules
npm run test:temple-simulation
npm run test:temple-multiplayer
npm run test:browser-temple
```

The focused import guards check the immutable reference hashes, exact
standard/easy recipe quantities, the scoped fourth Deeper into the Ruins copy,
exclusion of rulesheet proxies, all forty
source scan hashes and face directions, neutral Uncharted artwork aliases,
the scoped grotto correction, canonical player-card reuse and all ten player
inspection artwork mappings.

The account migration adds Temple to the permitted game-choice scenario
names. Local account tests exercise the migration and existing row-level
security rules. This import does not apply the migration to a hosted database.
