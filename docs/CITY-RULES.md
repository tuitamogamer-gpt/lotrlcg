# The City of Corsairs — original scenario rules

The runtime follows the original MEC53 adventure, using its printed quest cards and the publisher's original rules insert. It supports the original standard and easy modes for one to four local players. The original source snapshot remains immutable; corrections verified against printed artwork are recorded in `CITY-SOURCES.md`.

## At sea

The active encounter deck contains Coast of Umbar, Stormy Weather, Umbar Fleet and Voyage Across Belegaer cards, with Raider enemies separated into the Corsair deck. The entire City of Corsairs encounter set is the inactive second encounter deck, including Captain Sahír and The Shattered Monument. Their later removal happens during stage 3A, as printed; the reference recipe's pre-positioned set-aside representation is not a second physical copy.

Every player selects one unique Ship objective and the fleet includes Dream-chaser. A solo player controls Dream-chaser and one additional ship. The Heading card is physically attached to Dream-chaser. One Southern Belfalas begins in staging for one or two players; two begin in staging for three or four. The spare copy for a smaller group is shuffled into the sea encounter deck.

The Coast of Umbar has Sailing and prevents quest progress while off-course. The players advance when they place 15 progress or actually destroy Stormcaller. Stormcaller has 18 printed hit points and Victory 10. Discarding it does not count as destroying it or earn victory points. Its end-of-round choice returns the same physical enemy to staging, or shifts the heading off-course.

## From sea to land

Stage 2A first totals damage on every Ship objective each player controls. That player assigns the corresponding damage among their own non-Ship characters. Each point is a saved, resumable choice; actual damage and destruction responses resolve before the next assignment. Only then are all Ship enemies, Ship objectives and Ocean locations discarded. Discarding the fleet does not trigger its destruction losses or controller elimination. Caleb Grace's 29 November 2016 ruling (ALeP compilation §3.226) additionally instructs players to discard every shadow card in play at this point. Surviving Corsairs therefore carry no sea-deck shadows into the land stage; discarded Watch Tower and Battle-Hardened shadows are eligible for the subsequent transfer.

Stage 2B moves the remaining Corsair deck and Corsair discard pile into the City deck. Every Watch Tower and Battle-Hardened in the sea encounter deck or discard is moved there as well. Copies already in play remain in play. The sea deck and discard are retained as inactive piles, and Sailing ends. The second deck becomes active and the players immediately proceed to stage 3.

Stage 3A searches the newly active encounter deck for the physical Sahír and Monument and sets them aside. Each player then selects an enemy and a location from that encounter deck to add to staging. Searched cards are added rather than revealed. If Stormcaller was not destroyed during stage 1, every Raider currently in play gains one resource after these searches. Stage 3B has 18 quest points and no additional printed rules text.

## Final confrontation

Stage 4A adds the set-aside Monument to staging and puts the same set-aside Sahír into play engaged with the first player. Each player searches the encounter deck and discard for an enemy to add to staging; the deck is shuffled and every Raider in play receives a resource. Sahír follows the first player when that identity changes.

Sahír discards one resource to cancel each point of damage he would take, up to his available resources. Every complete group of five resources grants an additional attack against his engaged player during each combat phase. The engine recalculates his normal attack budget from his current resources and the ordinary attacks already completed. Players can choose his attacks alongside other enemies' attacks in the normal enemy-attack window. Immediate attacks from other card effects do not consume that budget. This timing follows the printed passive and the continuously recalculated quantities required by FAQ §1.43; no Sahír-specific designer timing ruling was found. Additional attacks explicitly discard every previous shadow and receive a fresh shadow, as required by FAQ §1.42. Each attack has its own ordinary defense and response windows, and the attack ledger survives saving and restoration.

The printed stage 4B says **any enemy**, including Sahír himself: while any enemy has resources, Sahír gains indestructible. This is granted by the quest and survives blanking of Sahír's own text. It prevents destruction from damage without canceling that damage. Once the final enemy resource disappears, a Sahír already at lethal damage is destroyed by the normal state check.

Actual destruction of a hero or enemy transfers its remaining resources to Sahír; discard and other non-destruction departures do not. Destroying Sahír earns his printed Victory 20 and wins the game. Stage 4's zero quest-point field never permits a progress victory.

The Shattered Monument grants immunity to player **events** to Raiders with resources, both while in staging and while active. This immunity does not extend to other player card types. At the beginning of each resource phase its Forced effect adds one resource to every Raider in play.

## New encounter interactions

- Watch Tower grants a resource whenever a new Raider actually enters play. Moving an existing enemy between staging and engagement does not constitute entering play.
- Umbar Slaver gains attack and threat for each resource. A complete resource payment triggers each Slaver engaged with that payer once, including payments split between hero pools. Resource transfers and forced losses are not spending.
- Slave Ship's additional damage uses actual combat damage dealt to a Ship objective. The defending player assigns it among their own non-Ship characters. Prevented damage does not create an assignment.
- Corsair Waters counts all allies that entered during the current round, including entries before it became active. Ship objectives follow the original Grey Havens ally rules.
- Serpent's Tail deals physical shadow cards to all Ship enemies before applying its round-long off-course engagement reduction.
- Foes of Ecthelion applies its resource-scaled threat increase to the Raiders in staging at resolution. Repeated copies stack until the phase ends. Fury and Malice first increases engaged Raider resources, then assigns damage in the respective player's fellowship; the printed surge conditions are preserved.
- Umbar Patrol returns one engaged enemy per player, prevents optional engagement through the round, and searches only if staging contains no enemy afterwards. Mandatory engagement checks continue normally.
- Streets of Umbar resolves its printed travel-or-resource choice when an empty active-location slot offers travel. Southern Belfalas and City of Corsairs pay their actual printed search/engagement travel costs before entering the active slot.

All public scenario views expose pile counts and visible board facts. The order and contents of the inactive second deck, Corsair deck and inactive sea piles remain private. Serialized choices retain physical IDs, owners and exact deck positions and can be restored during fleet selection, damage assignment, travel costs, searches and immediate attacks.
