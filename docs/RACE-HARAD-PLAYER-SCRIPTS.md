# Race Across Harad — player cards

All ten original player designs are new runtime registrations. Their original
reference records remain unchanged: one hero and nine designs with three copies
each, for 28 physical player cards. The only numeric additions to a runtime
definition are Explore Secret Ways' six quest points and Victory 1, confirmed
on the original card face.

| Code | Card | Automated behavior |
| --- | --- | --- |
| 17028 | Thurindir | After every player has kept their opening hand, his controller searches their own physical deck for a side quest, adds the chosen copy to hand and shuffles. This follows the mulligan and precedes scenario setup that waits for kept hands. His continuous bonus counts both player and encounter side quests in the victory display. |
| 17029 | Kahliel's Tribesman | His Action selects another affected Harad character, including another player's character, exhausts the actual source ally, and grants one willpower, attack and defense until the end of the phase. The lasting bonus remains if its source leaves play. |
| 17030 | Steed of the North | A Restricted Mount for a Dúnedain or Ranger hero. The attached hero's controller may exhaust the physical Mount after they actually engage an enemy to ready that hero. A different player's engagement does not trigger it. |
| 17031 | Mighty Warrior | Attaches to a hero with one copy per hero and grants Warrior. Its controller may draw a card after playing it from their hand. Putting it into play or playing it from a deck does not offer the response. A player who gains control of an attachment played by somebody else did not play that card from their own hand. |
| 17032 | Proud Hunters | The caster must control a unique Noble and a different unique Ranger. After an actual attack destroys an enemy, an optional physical event response selects one participating hero controlled by its caster. Its reward is the destroyed enemy's printed threat, independent of threat modifiers. The common event payment, cancellation and held-event path is retained. |
| 17033 | Dunedain Pathfinder | Every entry into play triggers its Forced top-five encounter search before optional ally-entry responses. A chosen physical non-unique location enters staging without being revealed; location-entry keywords and responses still apply. If no location enters, only this physical Pathfinder is discarded. The encounter deck is shuffled either way. Desert Crossing's mandatory ally-entry effect resolves first, then this Forced search, once each after saved choices. |
| 17034 | Backtrack | Normal play requires a main quest without keywords, removable main quest progress and an affected staging location. After paying for the physical event, two saved choices select a location and an amount. That progress is removed from the main quest even if a side quest is currently selected, then placed on the chosen location using the normal exploration path. |
| 17035 | Eryn Galen Settler | After an actual active location is explored, its controller may discard the selected physical Settler to discard an affected staging location with the same printed title. Ally-departure effects resolve before the selected location leaves play. Exploring a staging location does not trigger it. |
| 17036 | Explore Secret Ways | A six-progress, Victory 1 side quest. While in victory, matching-title staging locations contribute no threat when an active location has that title; their own current threat remains available for other card effects. An additional defeated copy goes to its physical owner's discard. |
| 17037 | Steward of Orthanc | When its controller plays an event, including a triggered Response event, an optional response gives that event Doomed 1 to draw one card. Every player's threat rises and Doomed responses finish before the draw and interrupted event resolve. The controller's round limit is shared across all copies and survives saves. |

Player attachments on characters follow the host's controller while preserving
physical ownership. All new queued effects use the `raceHaradPlayer` prefix so
the scenario dispatcher cannot resolve them under the wrong player's scope.
Optional response initiation is recorded separately from subsequent cost and
target choices; declining an offer does not use that printed ability.

`tests/race-harad-player.test.ts` passes all 38 focused checks, using native
setup, mulligan, play, ability, attack, quest and engagement actions; physical
duplicate costs; multiplayer ownership; phase and round limits; and restoring
every pending decision. It also rehearses the exact native quest fixtures used
for Settler and Explore Secret Ways in the browser.

`scripts/browser-race-harad-players.mjs` requires 32 checkpoints at each of
1280, 390 and 320 pixels. It exercises native controls for all ten designs,
pending and completed reloads, every original printed face, exact cached image
bytes and image decoding, horizontal overflow and dialog bounds. Final browser
results are recorded in `output/race-harad-players/report.json`. All 96 checks
passed against the frozen release `index-CPSWsB-7.js` (328,197 bytes; SHA-256
`27fca54fbc11026802b5d8a64b182cfcc6a85652d2642b8e85527ae45d6d1cbc`),
with no browser errors, image failures, horizontal overflow or clipped dialogs.
