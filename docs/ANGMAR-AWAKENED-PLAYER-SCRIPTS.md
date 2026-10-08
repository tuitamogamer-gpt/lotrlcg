# Angmar Awakened player cards

The six original Adventure Packs add 60 player designs: six heroes, 18 allies,
12 attachments, 20 events and four player side quests. The runtime registers
58 new definitions and reuses the existing canonical Elf-friend (`10093`) and
The Long Defeat (`10122`) definitions. Normal and easy quests use this same
player pool.

Definitions come from the official card records in `public/catalog.json`.
Their printed text, art identity, traits, uniqueness and stats are retained in
`src/data/angmar-player-cards.json`. The source catalogue omits the progress
requirement and victory points on the four player side quests. The original
card faces supply these values:

| Player side quest | Progress requirement | Victory |
| ----------------- | -------------------: | ------: |
| Scout Ahead       |                    4 |       1 |
| Double Back       |                    4 |       1 |
| Delay the Enemy   |            8, Battle |       1 |
| Send for Aid      |                    6 |       1 |

Each has the printed limit of one copy per deck. The catalogue remains an
immutable source; these missing values are recorded in the runtime import.

## Printed rules

| Pack                     | Implemented rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Wastes of Eriador    | Merry reacts to enemies revealed from the encounter deck; Ingold counts heroes with resources; Rallying Cry replaces ally discards, with its separate Valour Action; Honour Guard cancels damage before destruction; Raven-winged Helm protects its Sentinel hero; Curious Brandybuck enters after travel and goes to the owner's deck after active-location exploration; Hobbit Pony commits its hero during a quest action window; East Road Ranger checks the selected side quest; Scout Ahead searches and orders the top cards; Ranger of Cardolan pays its engagement Response and departs at round end.                                                                                                            |
| Escape from Mount Gram   | Rossiel checks shared traits in the victory display; Veteran of Osgiliath checks its controller's threat; Descendants of Kings readies controlled Dúnedain characters; Derndingle Warrior pays damage for a defense bonus once per attack; Boomed and Trumpeted responds to surviving damaged Ents; Elven Jeweler pays two other hand cards to enter; Double Back reduces each player's threat; Leave No Trace moves the explored physical location and its event to victory; Distant Stars discards a location and searches a replacement; Keen as Lances counts cards worth no victory points and moves its own event to victory.                                                                                       |
| Across the Ettenmoors    | Dori contributes current defense to another defending hero; Ranger Provisions gives the first player's heroes resources; Dúnedain Message searches the whole deck for a side quest; Longbeard Sentry pays two deck cards and gains Sentinel and defense for the phase; Delay the Enemy discards an eligible engaged enemy per player; Steed of Imladris reacts to actual commitment; Fair and Perilous uses current willpower; Wellinghall Preserver enters exhausted and heals after readying; None Return moves a destroyed physical enemy and its event to victory; Hope Rekindled offers its two distinct ordinary and Valour Actions.                                                                                |
| The Treachery of Rhudaur | Erestor draws three additional resource-phase cards and discards the complete hand at round end; Reinforcements requires three different resource pools, puts up to two physical allies under chosen controllers, and returns them to owners at phase end; Send for Aid searches each player's top ten cards; Elven Spear pays movable hand cards with a three-use phase limit; Horn's Cry offers ordinary and Valour enemy groups; Galadhrim Weaver recovers the actual top discard; Silver Harp recovers a physical discarded hand card; Galdor draws once per round; The Door is Closed! cancels the complete matching-title encounter reveal; Elf-friend uses its existing trait handler.                             |
| The Battle of Carn Dûm   | Amarthiúl derives his Tactics icon and additional resource from engagements; Guardian of Arnor counts engaged enemies for defense; Doom Hangs Still suppresses quest-failure threat or pays group threat to skip questing; Beechbone pays damage after attacker declaration; Hold Your Ground! offers ordinary and Valour readying; Lindir draws up to three after entering; Lords of the Eldar plays only from discard, moves to the bottom before its round bonus and stacks by physical event; The Long Defeat uses its existing defeated-quest collector; Quick Ears cancels an entire enemy reveal and reveals a replacement; Favor of the Valar attaches to a player's threat dial and replaces threat elimination. |
| The Dread Realm          | Arwen pays a hand card for an eligible resource pool; Éothain distinguishes a Rohan ally discarded by an effect from destruction or a discard cost; Sword of Númenor gives attack and rewards qualifying combat kills; Fornost Bowman counts engaged enemies; Hour of Wrath offers one hero or a selected player's heroes; Elven-light plays only from discard and returns before drawing; Tale of Tinúviel pays a controlled character's exhaustion and uses printed willpower; Galadhrim Healer heals the selected player's heroes; Weather-stained Cloak protects a committed Ranger; Sword-thain changes a physical unique ally's card type without changing its definition.                                          |

## Timing, ownership and saved games

Printed Actions and Responses use the shared serializable ability boundary.
Only initiating a printed ability credits a scenario's ability trigger;
selecting its costs, targets or a declining option does not create another
ability. Valour checks the initiating player's current threat, including a
remote player's Response.

Damage cancellation precedes destruction, may use multiple legal sources, and
cannot cancel an ability's damage cost. Honour Guard's Valour Response allows
the chosen amount from one through five. A destroyed Ent cannot initiate
Boomed and Trumpeted. Shared commitment, readying, damage, travel, departure,
combat-kill, side-quest and end-of-phase hooks keep the new cards compatible
with the existing sets.

Cards retain their physical owner when another player controls or borrows
them. Departure sends a card to its owner's pile; Silver Harp returns the
discarded card to the responding player's hand. Pending recoveries follow
discard-index shifts and cannot recover a different identical copy. The
Power of Angmar prevents effect-based recovery and discard-only event plays.
Sword-thain preserves identity, gains hero resource and attachment rules,
and returns to the ally type when its attachment is removed or blanked.

Whole-card cancellation suppresses placement, When Revealed, Doomed and Surge.
Continuing the reveal retains its origin and guarded-card context, preserves
Thalin's earlier damage, and offers Merry once. Quick Ears shuffles the canceled
enemy back before drawing the replacement. A new reveal of the same card is
resolved normally. The Eaves of Mirkwood prevents those cancellation options.

Lords of the Eldar follows the player-card lasting-effect rule in the
[official Rules Reference, page 10](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf).
Each physical event affects the Noldor characters present when it resolves.
Later arrivals receive no bonus. An affected character keeps its bonus if its
traits change, but loses it when it leaves play; another entry starts a new
instance.

## Verification

`node --import tsx --test tests/angmar-player.test.ts` covers every design,
actual physical plays from hand and discard, multiplayer ownership and
responses, timing limits, immunity, scenario restrictions and JSON reloads
through pending choices. The dedicated fixtures are exported from
`tests/angmar-player-fixtures.ts` for browser verification.

The player suite passes 100 focused checks, including Erkenbrand, A Burning Brand
and Dúnedain Watcher cancellation of shadows granted by Mountains of Angmar.
`npm run check` also passes. This is semantic and
save-invariant coverage; it does not measure deck strength or win rate.
