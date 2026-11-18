# The Hunt for the Dreadnaught

The Fellowship event scenario of 2019 (`the-hunt-for-the-dreadnaught`),
played cooperatively in classic solo and by one group of one to four local
players. A Corsair fleet led by the Dreadnaught threatens the coasts of
Gondor: each player commands one of six ships, fights off the Corsairs that
board the fleet, and then hunts down the Dreadnaught.

## Sources and corrections

- The recipe (Q99.15) holds the 2 quest cards, 43 encounter cards, the 13
  cards of the **Corsair deck** (its second encounter deck section) and 20
  set-aside cards: the three Setup cards, the six unique ship-objectives, the
  four Gondorian Warships, the Dreadnaught and the six unique Corsair enemies
  (78 cards).
- The immutable snapshot
  `src/data/pending/the-hunt-for-the-dreadnaught-import.json` (SHA-256
  `465640783813851677c26eab076af3821168b0fb8a727a6e5ac101a697a6de24`) holds
  the 46 cards; `tests/hunt-dreadnaught-source-quantities.json` keeps every
  card's quantity, type and recipe section.
- `tests/hunt-dreadnaught-art.json` pins all **58 faces**. Twelve cards are
  printed on both sides: the two quest cards, the three Setup cards, the six
  unique ships (Basic and Upgraded sides) and the Dreadnaught (Elite and
  Damaged sides). The catalog has no stats for the other sides, so the
  Upgraded ships and the Damaged Dreadnaught are their own `:B` definitions
  (as in The Drowned Ruins), with the scans' stats, traits and texts; each
  one's physical card is its front. Every face was checked by eye against the
  catalog, which the scans correct:
  - The Upgraded sides: Eithiliant 6/4/4/15, Golden Wing 3/6/4/18, Pride of
    Lebennin 4/3/6/19, Silent Mist 5/4/5/17, Swan Ship of Dol Amroth 4/5/4/20
    and Twilight's Call 4/5/5/22 (willpower, attack, defense, hit points); the
    Damaged Dreadnaught has 3 threat, 5 attack, 3 defense and victory 99.
  - The Dreadnaught's Elite side is **Massive** too (the catalog prints its
    Archery twice instead); on both sides it cannot take more than 5 damage
    per player each round and has a global hit point value of 15 per player.
  - Standard Mode's Quest Action also reveals the top card of the encounter
    deck; Standard and Hard Mode "Set aside all 7 unique enemies"; Hard Mode
    stages 2 Wicked Cove "instead" with 3 or more players; Golden Wing's
    threat reduction is a "Setup:" ability and its Upgraded side "gets +2 hit
    points"; Silent Mist plays events "with a cost of 3 or more".
  - Swan Ship of Dol Amroth's Upgraded side prints "After Swan of Dol Amroth
    flips", and stays so.
  - Typos: Easy Mode "loction", Hydraken "player cards effects", Corsair Skiff
    "eithe" and "Bording", Corsair Skirmisher "gaines", Cobas Haven "Boading",
    Mouths of Anduin "is gains", Tolfalas Landing "Tofalas", Ballista Barrage
    "players threat" and Violent Tempest's missing "damage".
  - The catalog repeats each keyword line, writes every apostrophe and
    quotation mark as a backtick, prints no shadow effect (the scans add 14)
    and runs paragraphs together.
- The rules insert (Hall of Beorn's scans) gives the ship, Corsair deck,
  global value and keyword rules below.
- The atlas rates the scenario 6.
- **Not supported**: Epic Multiplayer Mode (several groups with an event
  organizer) — one group plays, so each "any group" is this group and the
  global values count its players; the contract A Perilous Voyage (a player
  card outside the recipe); and Silent Mist's "your collection" (its Upgraded
  side's Response takes events from the discard pile only).

## Setup

1. **Preparing the fleet**: before drawing the starting hands, each player in
   turn chooses and takes control of one of the six unique ship-objectives,
   Basic side faceup. Silent Mist's player then draws 8 cards; Pride of
   Lebennin's player draws 5 more and shuffles 5 cards from their hand back
   into their deck, and cannot take a mulligan.
2. **The Setup card**: the engine's easy mode plays Easy Mode; otherwise the
   first player chooses Standard or Hard Mode. The chosen card is flipped over
   next to the quest deck and the other two are removed from the game.
3. The 13 non-Ship Corsair enemies form the shuffled **Corsair deck**. The 7
   unique enemies (including the Dreadnaught), the unused ships and the 4
   Gondorian Warships are set aside.
4. Easy Mode also sets aside 2 Black Sails and 1 Corsair Warship and stages
   Cobas Haven (each hero has its additional easy-mode resource). Standard
   Mode discards cards from the top of the encounter deck until 2 locations
   are discarded (3 with 3 or more players) and stages them. Hard Mode stages
   3 Tolfalas Landing (and 2 Wicked Cove with 3 or more players).
5. The ships' Setup abilities resolve: Eithiliant (a hero gains another hero's
   printed Traits), Golden Wing (reduce your threat by 3; a hero gains ranged)
   and Swan Ship of Dol Amroth (1 resource on each of your heroes).

## The rules

- **Ships**: ship-objectives are allies (and characters) for all purposes,
  except that they can only attack ship-enemies and only defend against
  ship-enemies; an attack by a ship-enemy can only be defended by a
  ship-objective, and its undefended damage goes to a ship-objective of the
  attacked player. Sea Monster lets ship-objectives attack and defend against
  it. The ships have sentinel, so they also defend for other players.
- **A player who controls no ship-objective is eliminated** (the Setup cards'
  other side); a captured Corsair Skirmisher or a Gondorian Warship counts.
- **Boarding X**: after a ship-enemy with Boarding engages a player from the
  staging area, the top X cards of the Corsair deck are put into play engaged
  with that player — not when it engages from another player's area or is put
  into play engaged. Cobas Haven reduces each Boarding value by 1 while it is
  the active location.
- **The Corsair deck** has its own discard pile: each non-Ship Corsair enemy
  that would be discarded goes there, and it is shuffled back into the
  Corsair deck as soon as the deck runs out.
- **Pillage X**: after an enemy with Pillage X attacks a player, that player
  discards the top X cards of their deck.
- **Massive**: the Dreadnaught cannot leave the staging area (it is never
  engaged), is considered engaged with each player and attacks each player in
  turn during the combat phase; each of its attacks is dealt its own shadow
  card.
- **Global values** count the players of the group who started the scenario.
- **Archery**: the Elite Dreadnaught (1 per player), Black Sails and Corsair
  Warship in the staging area (3 and 4), War Galley (2), Varjax (3) and
  Ballista Barrage (2 for each Ship enemy, each copy revealed this round).

| Stage                         | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Searching the High Seas | 8 per player | No more than 5 progress per player each round; the players advance only at the end of the quest phase (the Setup card stays next to the quest deck).                                                                                                                                                                                                                                                                                                |
| 2A/2B Destroy the Dreadnaught | –            | 2A adds the Dreadnaught, Elite side faceup. No more than 5 progress per player each round. Action: remove 5 progress per player to shuffle a set-aside Gondorian Warship into the encounter deck. Response: when the Dreadnaught is about to attack you, raise your threat by 4 to cancel the attack (an ability on the Dreadnaught before you declare a defender, or a choice when it makes an immediate attack). Destroying the Dreadnaught wins. |

**The Dreadnaught**: 4 threat, 7 attack, 4 defense and 15 hit points per player
on its Elite side; immune to player card effects; it cannot take more than 5
damage per player each round. At the end of the round, with less than half of
its hit points left, it flips to its Damaged side (3 threat, 5 attack, 3
defense; the damage stays) and each player puts a random set-aside unique
Corsair enemy into play engaged with them.

## The ships

| Ship                    | Basic side                                                                                                                                     | Upgraded side                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Eithiliant              | Your heroes +1 willpower; Setup: a hero gains another hero's printed Traits until the end of the game.                                         | +2 willpower; when it flips, shuffle up to 6 cards from your discard pile into your deck and place 6 progress on a location. |
| Golden Wing             | Ranged; your heroes +1 hit point; Setup: reduce your threat by 3 and a hero gains ranged.                                                      | Your heroes +2 hit points and ranged; when it flips, deal 6 damage to an enemy.                                              |
| Pride of Lebennin       | Your heroes +1 defense; your starting hand draws 5 more and returns 5; no mulligan.                                                            | +2 defense; when it flips, heal 2 damage from a character and add up to 2 encounter discards to the victory display.         |
| Silent Mist             | Starting hand of 8; Action events costing 3 or more cost 1 less.                                                                               | They cost 2 less; when it flips, add up to 2 events from your discard pile to your hand.                                     |
| Swan Ship of Dol Amroth | Setup: 1 resource on each of your heroes; Action: spend 2 resources to ready a character (once per round).                                     | Action: spend 1 resource to ready a card (once per round); when it flips, add 2 resources to a hero and ready a card.        |
| Twilight's Call         | The first card you play each round needs no resource match; play an ally or attachment outside the planning phase once per round (its Action). | Each card you play needs no resource match, and its Action has no limit; when it flips, draw 3 cards.                        |

Silent Mist's Action, which has no limit, works as a cost reduction on each
event with an Action that its player plays from hand; Twilight's Call's Action
lets its player play an ally or attachment during any action window. **Belfalas
Shipyard**'s Response, after it is explored as the active location, has the
players spend 5 resources as a group to heal 5 damage from a ship, ready it
and flip it to its Upgraded side, whose Response then resolves.

## The Setup cards' other sides

- **Easy Mode**: each player draws 1 additional card during the resource
  phase; Quest Action (once per game): deal 10 damage to a non-unique engaged
  enemy.
- **Standard Mode**: the same Quest Action, then reveal the top card of the
  encounter deck.
- **Hard Mode**: each player's threat cannot be reduced by more than 1 each
  round (from round 1); after a player card heals or readies a character, its
  controller raises their threat by 1.

The Quest Actions are abilities of the Setup card next to the quest deck.

## Encounter cards

| Cards                                                                                                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Captain of the Haven                                                                                                      | Pillage 8; its engaged player is eliminated at the end of the combat phase with no cards in their deck.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Commander of the Dreadnaught                                                                                              | After it attacks you, the Dreadnaught attacks you.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Descendant of Castamir                                                                                                    | After it engages you, the top 2 cards of the Corsair deck are put into play engaged with you with a shadow card each.                                                                                                                                                                                                                                                                                                                                                                                    |
| Hydraken                                                                                                                  | After it attacks, it makes an additional attack with 2 shadow cards and its player raises their threat by 4 (once per round).                                                                                                                                                                                                                                                                                                                                                                            |
| Ophidian                                                                                                                  | No more than 1 character can attack it each round; 2 damage to each character defending against it.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Varjax                                                                                                                    | Archery 3; each point of excess combat damage it deals is dealt to a Ship of the defending player.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Brash Corsair, Corsair Plunderer ×3, Daring Buccaneer ×3, Fierce Marauder ×3, Southron Sailor ×2, Umbar Captain           | The Corsair deck. Brash Corsair attacks when its player exhausts a ship; the Pillagers discard an attachment, deal 1 damage or discard a resource for each event their Pillage discards; Southron Sailor makes each Ship enemy engaged with its player add its threat to the staging area; Umbar Captain stops its player attacking Ship enemies.                                                                                                                                                        |
| Black Sails ×2, Corsair Skiff ×2, Corsair Skirmisher, Corsair Warship, Ramming Ship, Slave Ship, War Galley ×3            | Ship enemies with Boarding (Skiff and War Galley gain Boarding 1 unless their player raises their threat by 3 or 4); no attachments; Black Sails and Corsair Warship gain Archery in the staging area, where Corsair Warship cannot be damaged; Ramming Ship gets +4 attack after it engages; Slave Ship's damage to a ship echoes to a non-Ship character; Corsair Skirmisher, destroyed, can be captured as a ship-objective with 3 willpower by discarding allies with at least 3 willpower in total. |
| Sea Monster ×2                                                                                                            | Ships may attack and defend against it; when revealed, 4 damage to the Ship with the fewest remaining hit points.                                                                                                                                                                                                                                                                                                                                                                                        |
| Belfalas Shipyard ×2, Cobas Haven, Isle of Fortune ×3, Mouths of Anduin ×3, Tolfalas Landing ×3, Wicked Cove ×3           | The ships' repair, Boarding −1, resources for the heroes, a reveal after a canceled 'when revealed' effect, threat for player card draws, and staged locations immune to player card effects.                                                                                                                                                                                                                                                                                                            |
| Ballista Barrage ×3, Boarding Party, Grappled!, Out of the Mist ×3, Overworked ×2, Taking on Water ×2, Violent Tempest ×3 | Archery for the Ship enemies, a Corsair for each player, conditions on a ship (it cannot ready; 2 damage when it exhausts; exhaust 3 characters to discard), the enemy with the highest engagement cost engaging and attacking the first player (surge without an attack), blank non-Ship allies (surge with 7 or more allies), and 1 damage to each enemy and damage for each exhausted character.                                                                                                      |
| Gondorian Warship ×4                                                                                                      | Set aside; 2B's Action shuffles one into the encounter deck. When revealed, the first player chooses a player who gains control of it; destroyed, it is set aside again. Shadow: 5 damage to the attacking enemy.                                                                                                                                                                                                                                                                                        |

The six unique Corsairs (set aside, Elite, immune to player card effects,
victory 10) each stop their engaged player attacking the Dreadnaught.

Every shadow effect follows its scan: Black Sails returns an engaged attacking
Ship enemy to the staging area after the attack, Ramming Ship puts a Corsair
into play with a shadow card, Belfalas Shipyard gives +1 attack and Pillage 3,
Mouths of Anduin reveals a card after an undefended attack, Tolfalas Landing
raises your threat by 1 (3 with 5 or more cards in hand), Wicked Cove makes the
attacker immune with +2 defense this round, Ballista Barrage assigns 2 damage
(3 with 10 or more cards in your discard pile), Boarding Party gives +1 attack
(+2 with an exhausted ship), Grappled! and Taking on Water attach to a
defending ship, Out of the Mist raises your threat by 4 or makes an additional
attack, Overworked gives +1 attack (+3 with 7 or more allies) and Violent
Tempest deals 1 damage to the defender.

## Verification

```sh
npm run test:engine
npm run test:hunt-dreadnaught-simulation
npm run build
npm run test:browser-hunt-dreadnaught
npm run audit:rules
```

The focused suites (`tests/hunt-dreadnaught.test.ts`, 13 tests, and
`tests/hunt-dreadnaught-cards.test.ts`, 13 tests) cover the fleet and the
starting hands, the three Setup cards in one to four players, both stages, the
Dreadnaught (Massive, Archery, its damage cap, the flip and the win), 2B's
Action and Response, the ship rules and elimination, every ship's abilities
and Upgraded side, the Setup cards' other sides, Boarding, the Corsair deck,
Pillage and every enemy, location, treachery and shadow effect, and saves. The
source test pins the snapshot, every card's quantity and section, the other
sides, the scan corrections and all 58 faces.

The dedicated matrix (`tests/hunt-dreadnaught-simulation.test.ts`, in six CI
partitions: each mode's complete games and its late-game matrices) passes 57
games (9,614 actions) with exact save restoration after every action,
physical conservation (every card of the recipe in exactly one place: the
encounter deck and discard pile, the Corsair deck and its discard pile, the
set-aside and removed cards, the staging area, the players' ships and engaged
enemies, attachments, shadow cards and the treacheries being resolved, each
other side counted as its front) and private-view checks, and 27 exact
paced/immediate terminal-state comparisons. Its policy takes the ships in a
fixed order, raises its threat rather than let a Corsair Skiff or War Galley
gain Boarding, cancels the Dreadnaught's attacks while its threat is 35 or
less, defends with a hero or a ship that survives the attack, captures
Corsair Skirmishers and upgrades the most damaged Basic ship. The 21 games
from setup (one to four players and the three paced reviews in each mode)
are lost, the longest in round 7; the solo games end when the player's only
ship sinks, and standard and easy games also reach Destroy the Dreadnaught.
The 12 games started at the end of Searching the High Seas with all of its
progress advance, bring in the Elite Dreadnaught and lose, the longest in
round 5; the 12 started at Destroy the Dreadnaught lose, the longest in
round 5; and the 12 started in the last fight, with the Damaged Dreadnaught
on 3 hit points, are all won in round 1.

The browser suite (`scripts/browser-hunt-dreadnaught.mjs`) passes 44
checkpoints at 1280, 390 and 320 pixels: 8 native setups at 1280 (Standard
Mode with one to four players, Hard Mode with one and three, Easy Mode with
one and two) started through the actual fleet, Setup card and mulligan
dialogs, with every card of the recipe accounted for, the saved state
restored and the panel checked; the fleet and difficulty dialogs; both quest
cards, front and back; Boarding; the Elite Dreadnaught; Belfalas Shipyard
flipping Golden Wing; Corsair Skirmisher's capture; the Damaged Dreadnaught
with the unique Corsairs; and the players' win. It also checks all 58
original faces by size, SHA-256 and decoding.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
