# The Wilds of Rhovanion

The original deluxe's three scenarios support one to four players in
standard and easy modes, with original quest faces and encounter scans.
The UI shows each current quest's goals and the public state of its auxiliary
zones. The original source audit is in [WILDS-RHOVANION-SOURCES.md](./WILDS-RHOVANION-SOURCES.md).

Journey Up the Anduin keeps the Evil Creatures deck separate from the main
deck, including its discard and reshuffle. Successful main-quest progress
places stage resources; resource removal brings creatures into play. The
second stage caps progress on each staging location separately per round.
Exploring Woodmen Village flips its same physical card to guarded Haldan;
defeating the guard transfers Haldan to the first player. The final ford
requires five quest progress before travel, gains quest points per enemy,
and forces the staged enemies' attacks before it can be explored for victory.

Lost in Mirkwood preserves all seven quest designs and selects one branch
per stage through actual travel to a freed objective-location. Its searching
objective replaces main-quest progress with a physical encounter search.
Spiders and Orcs are added from the original set-aside copies. Captured heroes
and facedown hands retain their owners, IDs and locations through decisions,
rounds and save/reload; leaving their stage applies its printed loss. The
last branch either demands enough progress before defeating the nemesis or
16 progress with every player's engagement area clear.

The King's Quest tracks the six physical Caves cards and the three victory
locations needed to descend. Deep replaces the travelled location and
resolves the cave's “becomes active” effects. Forked Passage and the Lower
Depths can order the top two caves without disclosing the rest. Dragon Hoard
enters the bottom of the Caves deck, protects the Fire-drake until explored,
and supports the printed guarded Artifact response. At the final stage,
each declared attacker spends one main-quest progress before attacking.
Dragon Conditions and the Fire-drake's attacks retain their physical cards
and pending continuations.

Shared encounter mechanics include the Goblin Troop/Stray Goblin engagement
interactions, variable Hills/Underground Lake values, physical Lonely Lands
event storage, Lost in the Wild hand loss, Weighed Down, Dark location
restrictions, poison/no-ready effects, conditional revelation keywords,
Dragon Breath/Scales and original shadows. Encounter searches add rather
than reveal cards unless the printed text expressly says to reveal.

Validation covers original component recipes and local image hashes,
standard/easy setup at all four player counts, native travel/quest/combat
choices, physical captures and reverses, pending save reloads and malformed
private state. The dedicated browser harness is
`scripts/browser-wilds-rhovanion.mjs`; its full run uses 1280, 390 and 320
pixel layouts and inspects every original scenario face.
