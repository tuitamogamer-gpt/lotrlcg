# Danger in Dorwinion

The original **A Shadow in the East** adventure is implemented for classic
solo and one to four hot-seat players, in standard and easy mode. It uses the
original `Q09.2`/`E09.2` recipes and their 26 card identities, including both
faces of all three quests. See [the source review](SHADOW-EAST-SOURCES.md) for
the original MEC77 insert, face scans, quantities and transcription corrections.

The standard pool contains 36 encounter-deck cards, three set-aside Plots,
three set-aside Cultists and three quests; easy mode contains 28 encounter-deck
cards with the same six set-aside cards and three quests. Setup moves actual
different locations from the deck to staging, one per player, and requires
Side Street among those choices. It then shuffles the remaining deck.

## Investigation and confrontation

- **A City in Turmoil** requires five progress and at least two resources.
  Only exploration of an active location triggers its resource. Exploring a
  staged location still triggers City Forum, but does not satisfy the quest.
- **The Shadow of Mordor** adds one random physical Plot and reveals one
  encounter card per player. Its printed progress goal is zero. Each active
  location explored reveals a card before placing the quest resource, and the
  stage requires three resources plus the current number of players.
- **Leader of the Cult** adds one random physical Cultist, shuffles the
  encounter discard pile into the deck, and adds enemies discarded from the
  deck for every player after the first. The Cultist's total damage per round
  cannot exceed the active location's printed quest points. Added quest points
  from attachments do not increase this cap; healing does not erase damage
  already taken that round. Defeating the Cultist wins; direct discard does not.

Only the chosen Plot and Cultist enter play. Unchosen cards remain in the
physical set-aside zone, while public state exposes their count.

## Plots, Cultists and encounter sets

**Sauron Worship** starts with one damage and adds damage at round end. Each
token lowers every player's threat elimination level, composing with The One
Ring's separate penalty. **Bribes** discards actual top cards from every
player's deck when an active location is explored and counts discarded events
as staging threat resources. **Submit or Die** increases non-unique enemies'
attack and tracks resolved attacks that actually destroy a character, losing
when its player-scaled threshold is reached.

**Black Númenórean** retains physical shadows with printed effects, resolves
old faceup shadows again when attacking, receives ordinary new shadows, and
discards blank shadows. The retained shadows survive combat cleanup and
immediate attacks without cloning or replacing their physical cards. Cancellation
windows and triggered shadow responses still apply to replayed effects. The
printed, unqualified instruction not to discard effect shadows also prevents
player effects from discarding those particular cards; this is an interpretation
of the printed text, not a separately located designer ruling.

**The Governor** follows a newly revealed encounter location with engagement
and an immediate attack against the current first player. Merely adding a
location to staging does not trigger this response. **Priest of Sauron** cannot
be optionally engaged, and raises every player's threat only when its actual
attack destroys an ally.

**Evidence of the Cult** resolves Guarded (enemy) by discarding to a qualifying
enemy and putting it into play, rather than revealing the discarded cards.
The keyword refills an empty encounter deck even outside the quest phase.
The objective boosts its actual guard. When free, it moves to victory and
places a quest resource. A missing eligible enemy has a bounded free-objective
fallback.

**Secret Cultist** attaches to a highest-attack ally across all players, with
the first player resolving ties. It preserves the physical ally and its
attachments, changes its in-play type to enemy, blanks the full printed text
box, and engages its physical owner. It does not count as leaving play merely
because its type changes. Destruction, removal of the Condition, or elimination
of its physical owner discards the original ally to that owner's discard pile
and the Condition to the encounter discard pile. Removing the Condition and
the mandatory host discard form one atomic transition, so no save boundary
strands a printed ally in an enemy area.
Owner elimination also handles a transformed ally returned to staging by a
player effect, preserving the original owner of every attachment and discarding
its physical shadows exactly once.

**Seedy Tavern** holds actual facedown cards, including repeated Travel effects
from Under Guard. Its look-at-five choice, selected card and subsequent shuffle
survive reload. Exploration reveals the stored cards; leaving play without
exploration discards them. Public state shows counts, never hidden identities.

The remaining City of Rhûn, Servants of Sauron and Under Guard effects include
per-player threat timing, Servant's once-per-phase attacks, Treacherous
Easterling resources, Backstabber's paid choice, City Forum resources, Side
Street progress restrictions, Catacombs damage protection, the two side quests,
and all six printed shadow effects. Hillside Manor tracks actual player-card
threat reduction per player and round, including reductions earlier in the
round before the Manor entered staging. Encounter-source threat reduction
remains separate.
Darkness in the East's gained Surge opens the normal Lanwyn response window;
Disappearances' gained Doomed opens each player's Orthanc Guard, Isengard
Messenger and Keys of Orthanc responses. Its shadow can discard controlled
attachments on quests and threat dials as well as characters, enemies and
locations, routing each physical card to its owner's discard pile.

## Validation

`tests/danger-dorwinion.test.ts` and its fixture helper exercise native setup,
actor-owned choices, quest advancement, actual attacks and victory conditions,
cross-player transformations, optional responses, physical hidden cards,
retained shadows and save restoration. The final release records exact counts
in the top-level A Shadow in the East release notes.

The shared complete-game matrix is selected with:

```sh
SHADOW_EAST_SIMULATION_SCENARIO=danger-in-dorwinion \
  node --import tsx --test tests/shadow-east-simulation.test.ts
```

It covers standard/easy, one to four players, and two-player comparisons of
all three event-review modes, with physical conservation, public privacy,
pure rendering and exact restoration after every actual action. Seeded-policy
losses count as completed games; winning semantic fixtures separately verify
all three Cultist victory paths.

Final verification passed **54 semantic tests** and **14 complete games**:
2,181 actual action/save checks, six exact review-mode comparisons,
877 physical/rendering/idempotence boundaries and 2,168 privacy checks.
Logs are retained in `output/shadow-east-release/validation/` as
`danger-dorwinion-semantics.log` and `danger-dorwinion-games.log`.
