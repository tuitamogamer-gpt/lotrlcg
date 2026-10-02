# Published starter main decks

The Dwarf, Elf and Rohan modules implement the printed three-hero, 50-card
main lists of their separately sold products. The exact recipes are retained
in `officialStarterDecks`, and the client enables **Choose for play** only when
`deckProblems` confirms every design in that recipe is registered. Optional
sideboards have their own coverage and are not implied by support for the main
list. The four original Core learning decks keep their printed recipes.

Primary product lists:

- [Dwarves of Durin guide](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec103_rules.pdf)
- [Elves of Lórien guide](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec104_rules.pdf)
- [Riders of Rohan guide](https://images-cdn.fantasyflightgames.com/filer_public/1d/d6/1dd6170d-344d-4f9e-977b-7ef79c2d5c6c/mec106_rules.pdf)
- [Official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf)

## Dwarves of Durin

`dwarf-player-cards.ts` supplies the twenty additional main-list identities.
Dáin's continuous bonus inspects ready, unblanked Dáin across all players. Ori
counts the controller's Dwarves. Bifur transfers resources without creating new
ones and follows the host's controller. Dori's optional damage replacement occurs
after Song of Mocking and before Frodo's cancellation; declining Dori still offers
Frodo and preserves the original combat consequences.

Legacy of Durin follows the attachment's controller, while a discarded physical
attachment goes to its owner's discard. Mining responses distinguish deck discard
from ordinary hand discard, searches, direct hand additions and swaps. King Under
the Mountain's searched cards move atomically before discarded-card responses.
A Very Good Tale pays two legal exhaustion costs, remembers their combined cost,
and limits the search to the original five discarded cards. We Are Not Idle uses
the FAQ's Dwarf-hero restriction. Narvi's Belt grants a resource icon for the
current phase. Thrór's Map uses the current exhaust-and-travel erratum and, with
multiple active locations, replaces only the first player's chosen slot.

## Elves of Lórien

`elf-player-cards.ts` supplies nineteen additional identities; two Silvan allies
reuse the exact Return to Mirkwood registration. Galadriel's printed combat and
quest restrictions disappear when her text is blank, as do her printed passives.
Existing lasting Celeborn entry bonuses survive his departure or blanking.
Nenya retains its attachment text on a blanked Galadriel, but cannot exhaust a
hero bearing Shadow of Fear. Its phase willpower uses the chosen Galadriel's
current modified value. Newly entered allies gain Galadriel's quest exhaustion
exception only while that passive is active.

Haldir's Combat Action attacks an enemy beyond the controller's engagement using
the ordinary attack rules, with his own exhaustion cost and without Dúnhere's
staging bonus. O Lórien!'s reduction applies to the next Silvan ally and is consumed
by that actual hand play. Wingfoot names an encounter type on commitment, then
uses the current exhaust-and-ready erratum. The Tree People searches only its
original five cards. Host of Galadhrim returns allies atomically to their actual
owners before its controller chooses returned allies to play for free. Free play
keeps uniqueness, Dol Guldur and Return to Mirkwood's stage restrictions.

## Riders of Rohan

`rohan-player-cards.ts` supplies fifteen additional identities and reuses the
reviewed War Axe. Lothíriel's Rohan trait follows any live Éomer. Her committed
ally enters exhausted and questing, receives normal commitment/entry responses,
and returns to its owner's shuffled deck at the end of the quest phase. Hirgon
only responds after his own successful commitment; the player pays discounted
matching resources through explicit pool choices, then may pay the separate
threat cost for the round's combat bonus.

Wait no Longer and Oath of Eorl appear in their beginning-of-phase response
windows, instead of as ordinary hand actions. Oath records each participating
player's early attack turn, preserves attacks already made, then resolves enemy
attacks and gives ordinary attack turns only to players who did not use Oath.
This order and the remaining players survive save/reload. Two Oath players each
receive an early turn. Eligibility requires distinct unique Rohan and Gondor
characters controlled by the event's player.

The Muster of Rohan permits Rohan hero resource pools only for its own payment,
searches the original ten cards, prevents duplicate uniques, caps selection at
four, and discards surviving temporary allies at round end. The Red Arrow uses
Valour and its one-copy deck limit, moves the physical attachment into victory,
and searches only five cards. Horn of the Mark uses the departing character's
last known traits before attachments leave play. Éomer's once-per-round bonus
lasts through phases. Riddermark Knight's attack bonus lasts only for its chosen
attack and is followed by its discard. Forth Eorlingas! permits multiple controlled
Rohan heroes to attack staging without Dúnhere's bonus. Firefoot accepts a Rohan
hero or a hero with a Tactics resource icon, including a gained icon (original
Core rules, page 8).

## Client proof

Focused rules tests reside in `tests/dwarf-player-cards.test.ts`,
`tests/elf-player-cards.test.ts` and `tests/rohan-player-cards.test.ts`. Permanent
browser proofs are `scripts/browser-expansion-rules.mjs` for the Dwarf retail
path, `scripts/browser-elves.mjs` and `scripts/browser-rohan.mjs`. They use normal
client controls, verify actual published-list setup, keep decisions across reload,
check console errors and inspect layouts at 1280, 390 and 320 pixels.

`scripts/browser-khazad.mjs` separately exercises objective claim/movement,
printed quest A/B faces, a physical attachment counter and Bofur's hand action.
Screenshots are viewport captures from the unmodified interface.
