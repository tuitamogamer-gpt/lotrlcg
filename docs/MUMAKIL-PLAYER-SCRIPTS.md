# The Mûmakil — player cards

The original Adventure Pack contains ten player designs, 28 physical player
cards. Eight definitions are added to the runtime. Andrath Guardsman and Wait
no Longer keep their existing original-code implementations. The reference
catalog and the exact imported player records remain unchanged.

| Code | Card | Automated behavior |
| --- | --- | --- |
| 17001 | Kahliel | His own resources pay for Harad allies of any sphere. His Action chooses an exhausted Harad character anywhere in play, then a physical Harad ally card from his controller's hand to discard as its cost. The readying effect follows the paid cost and its reactions. The once-per-phase limit survives saves. |
| 17002 | Andrath Guardsman | The existing response triggers only when played from hand. A chosen non-unique enemy engaged with his controller cannot attack that player this round. |
| 17003 | Prepare for Battle | Costs one resource and needs six quest progress. Its printed Victory 1 and quest points are supplied only to the runtime definition because the reference catalog omits them. The actual first player draws one additional resource-phase card. A second defeated copy goes to its physical owner's discard. |
| 17004 | Yazan | Ranged. After an actual attacker declaration, his controller may deal one damage to an affected non-unique enemy in play, including another player's enemy. The response precedes ordinary attack damage and is limited once per phase. |
| 17005 | Wait no Longer | The existing quest-phase-beginning response searches only the actual top five encounter cards, puts a chosen enemy into play engaged with its caster, then reduces that phase's staging reveal by one when the enemy entered. The encounter deck is shuffled. |
| 17006 | Jubayr | Sentinel. Only actual exhaustion to defend triggers his response. His controller may discard one actual facedown shadow from a non-unique enemy before shadow resolution. Revealed shadows are excluded. The once-per-phase limit survives saves. |
| 17007 | Dwarf Pipe | Attaches to a Dwarf character, one per character. Its response exhausts the actual attachment to put a card just discarded from its controller's deck on the bottom of that deck. Current corrected text covers a discard from anywhere in the deck. Batch positions distinguish identical copies and are adjusted after each recovery. |
| 17008 | Firyal | Every actual quest commitment uses the same response hook. An optional response is offered before exposing the top encounter card. A second saved choice keeps or discards that exact top card before staging continues. |
| 17009 | Coney in a Trap | Its caster must control a unique Ranger and a different unique Warrior. The actual engagement response uses the common event-payment and cancellation continuation. The engaged enemy cannot attack that player for the rest of the round. |
| 17010 | Kahliel's Headdress | A unique Restricted attachment for Kahliel. Its global passive gives every affected Harad character one willpower. Its Refresh Action exhausts the attachment and shuffles only the topmost Harad ally in its controller's discard into that controller's deck. |

Player attachments on characters follow their host's controller while retaining
physical ownership. Consequently, an attachment played on another player's
character uses that character's controller's deck and discard for abilities
that say “your.” The Headdress's willpower bonus remains global.

Yazan checks player-card-effect immunity at selection and resolution. Jubayr
targets the facedown shadow card; the shadow does not inherit its enemy host's
immunity. Declaring Jubayr without exhausting him does not trigger the response.

Original faces and the Prepare for Battle correction are verified in
[MUMAKIL-SOURCES.md](MUMAKIL-SOURCES.md). Dwarf Pipe follows the corrected current
text preserved in the exact reference record.

`tests/mumakil-player.test.ts` exercises native play, ability, quest commitment,
attack, defense and engagement actions, physical costs and continuations after
save/reload, multiplayer ownership and control, resource matching, phase limits,
the first-player draw and the duplicate victory-display rule.
All 34 focused tests pass, including Dwarf Pipe followed by the actual Ered Luin
Miner response and rejection of an enemy attack prevented by Coney in a Trap.

`scripts/browser-mumakil-players.mjs` exercises the actual controls for all ten
designs at 1280, 390 and 320 pixels. It requires 34 checkpoints per width,
including every original printed face, exact returned image bytes, image decode,
horizontal-overflow checks and dialog bounds. All 102 checkpoints passed on
the frozen candidate `index-C6CX_j02.js` (323,469 bytes; SHA-256
`3a5fe4effa6bfd8a235e96cc66a9906bc231e79ff95ee4707632e711f4bcf983`),
with no browser errors, image failures, horizontal overflow or clipped dialogs.
The generated report is `output/mumakil-players/report.json`. Every player
fixture uses Passage Through Mirkwood so that the player paths can be assessed
independently of the new scenario.
