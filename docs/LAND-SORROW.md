# The Land of Sorrow

The original MEC82 Adventure Pack adds its normal/easy adventure for classic
solo and one to four local players, with all eleven original player designs
registered as new runtime definitions. The encounter deck reuses the complete
Easterling Raiders and Rolling Plains sets from A Shadow in the East through
their existing shared rules. The next chronological pack is
**The Fortress of Nurn**.

## Sources and corrections

- [Original rules insert, MEC82](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC82.pdf),
  SHA-256 `2e4be3a3789dec12f405324eb7b717de7f0f01d9669f12f4ea78d822553bbef7`.
  It prints Difficulty Level = 9 and the three encounter sets; it introduces
  no new keyword.
- [Independent normal/easy inventory](https://hallofbeorn.com/LotR/Scenarios/The-Land-of-Sorrow),
  retained as all 28 rows in `tests/land-sorrow-source-quantities.json`:
  51 normal and 38 easy encounter cards plus two quest cards. The upstream
  Q09.8/E09.8 recipes match it exactly, so runtime recipes are the unchanged
  preparation recipes.
- `tests/land-sorrow-art.json` pins source URLs, byte lengths and SHA-256 for
  **42 visually reviewed original faces**: 18 Land of Sorrow scenario faces
  (both quest reverses included), the ten reused A Shadow in the East faces
  and twelve player faces (both Messenger of the King sides).
- The immutable preparation snapshot is
  `src/data/pending/the-land-of-sorrow-import.json`, SHA-256
  `db63e32640f0caa625e8ce0b0dd723f2ef15da77d926ed141161439ee8e49b38`.

The reviewed scans restore four printed shadows the catalog omits
(Easterling Guard, Nurn Slaver, Cruelty of Mordor and Broken Captives),
correct Farin to **1 willpower, 3 attack, 0 defense and 4 hit points**
(the catalog repeated Edrahil's statistics), remove duplicated keyword lines,
and restore the quest flavour and both quest reverses. Bilbo's Plan's
catalog typo ("less that that") follows the printed "less than that".
Spare Pipe credits its printed illustrator. The original pack contains 31
scenario cards and 29 player cards.

## Scenario rules

Setup happens after opening hands. The three Camps enter the staging area;
the three Captive objective-allies are shuffled and each is attached to a
Camp as a guarded objective; the three Wardens are shuffled and one waits
faceup, not in play, beneath each Camp. Cards are then discarded from the
shuffled encounter deck until one location per player beyond the first has
been discarded; those locations are added to the staging area and every
other discarded card stays in the discard pile. These nine cards physically
exist from game creation in a set-aside zone, so physical conservation holds
before and after setup.

Stage 1B has 15 quest points. Camps are immune to player card effects, and
travel to a Camp is refused while any Warden is in play. At the end of each
round, each player raises threat by 1 per Camp in the staging area. The stage
cannot be defeated until the players control all three Captives; progress
keeps accumulating and the stage advances as soon as both conditions hold.

When a Camp becomes the active location by any means, its Warden leaves the
Camp: The Barracks adds it to the staging area unable to take damage this
round; The Storehouse adds it with +3 attack and −30 engagement cost until
the end of the round; Slave Quarters engages it with the first player, who
faces an immediate attack. Exploring a Camp moves it to the victory display
and gives the first player control of the Captive it guarded, keeping that
card's physical identity. If a freed Captive later leaves play for any reason
(including its controller's elimination), the players lose.

Stage 2A returns each Warden in the victory display to the staging area
(adjusting victory points), then each other player discards from the encounter
deck until an enemy is discarded and adds it to the staging area without
revealing it; the discard pile is reshuffled once if the deck runs out.
Stage 2B has 10 quest points plus 10 per living player. After commitment,
each player who committed at least one character and is not engaged with a
Warden reveals an encounter card before staging. The stage cannot be defeated
while a Warden is in play; defeating it wins the game.

| Card | Behaviour |
| --- | --- |
| Captives | Immune to player card effects. Edrahil offers its controller a draw for any player after questing successfully; Arador may ready after being declared as a defender (once per round, by encounter text, so Rocky Outcrop does not prevent it); Farin may deal 1 damage to any enemy engaged with a player after being declared as an attacker, including Wardens. |
| Wardens | Immune to player card effects; only the engaged player (the attacked player for an attack from staging) may declare attackers or defenders; Wardens in the staging area cannot be attacked. Ulwarth also refuses allies, including Captives. Lorgan raises each player's threat by 1, or 2 when its attack destroyed a character. Borlach assigns the excess damage of a lethal attack, one point at a time, among the attacked player's characters. |
| Easterling Guard | Archery 2 counts while it is in play. When Revealed assigns the current archery total. That total also includes Easterling Raider (1), each Recurve Bow (2) and Watch Tower (X while in staging), and it is allocated once at the beginning of combat. Shadow: the defending characters cannot ready this round. |
| Nurn Slaver | Surges while fewer Camps than players are in staging. Shadow: +1 attack per Camp in the victory display. |
| Working Fields | Characters cannot be healed while it is in staging. Travel: each player deals 1 damage to a character they control. |
| Watch Tower | Threat and archery X, where X is 1 plus the Captives the players control. Travel: reveal the top encounter card. |
| Overseer's Whip | Surge. Attaches physically to the Easterling enemy with the lowest engagement cost (ties are chosen); it counts as an Easterling attachment for Easterling Raider and can be attached by Warrior of Rhûn and Warriors of the East. When its enemy attacks, the attacked player deals 1 damage to an exhausted character they control. |
| Cruelty of Mordor | Every player deals 1 damage first; then every player chooses damage to each damaged character or that much threat. Shadow: +2 defense this phase. |
| Broken Captives | Exhausts every damaged ready character; if none, it gains surge and doomed 1. Shadow: a Warden makes an additional attack against the player. |

The interpretation that a Warden attacking from the staging area accepts
defenders from the attacked player is applied because no player is engaged
with it; the card's purpose is to exclude other players' Sentinel and Ranged
help. Encounter threat from Camps, Lorgan, Cruelty of Mordor and Rolling Plains
travel uses the encounter or quest-card threat reason.

## Player cards

| Card | Behaviour |
| --- | --- |
| Gwaihir | Ranged and Sentinel; cannot have Restricted attachments. The refresh framework (including An Arduous Journey, Into Fangorn and The River Running refresh limits) skips him, while other card effects may ready him. After any Eagle ally enters or leaves play his controller may ready him once per phase. |
| Hobbit Archer | Ranged; +1 attack against an enemy whose engagement cost is above the controller's threat, also shown in attack previews. |
| Red Book of Westmarch | Unique, Restricted, Hobbit heroes only. While its hero is committed, every Hobbit character gets +1 willpower. After a successful quest its controller may exhaust it to add a resource to that hero. |
| Dale Messenger | After entering play, choose a player; that player heals 1 damage from each character with a player card attachment. Healing restrictions apply. |
| Song of Healing | Limit 1 per hero. Any player may discard a hand card to heal 1 damage from the attached hero. |
| Eagle Emissary | Cannot have Restricted attachments. After questing successfully its controller pays 1 resource from a Tactics hero or discards it. |
| Bilbo's Plan | Played only in its response window after the player's attack destroys an enemy. Shuffles the encounter discard pile in, discards to the next enemy, and optionally adds that enemy to the staging area to discard a non-unique, non-immune location with threat no higher than the enemy's. |
| Spare Pipe | +1 hit point. After it is played, its player may search the top five cards for an event and shuffles the deck. |
| Smoke and Think | Reduces the next card its player plays by 1 per Pipe they control; every pending reduction is consumed by that next actual play. |
| Wilyador | Ranged and Sentinel; cannot have Restricted attachments. At the end of the round any player may spend 1 resource from any hero, otherwise it is discarded (which can ready Gwaihir). |
| Messenger of the King | Contract: at most two starting heroes. Setup chooses a non-neutral unique ally from the deck before hands are drawn, puts it into play, adds its printed willpower, attack, defense and hit points to starting threat, and attaches side B. The ally becomes a hero (collecting resources and receiving easy mode's resource), cannot be readied more than once per phase, and the contract is immune to card effects. If the ally leaves play the contract is removed from the game. |

Pending setup, response, upkeep and contract choices survive save/reload.
Saved setup continuations are accepted for this contract, as for the other
contracts with setup decisions.

## Verification

```sh
npm run test:engine
npm run test:land-sorrow-simulation
npm run build
npm run test:browser-land-sorrow
npm run audit:rules
```

The focused suites cover native one-to-four-player normal/easy setup and
physical inventory, both stages, Camp activation and exploration, Captive
loss, all encounter and shadow effects, Warden combat restrictions, Captive
responses, Lead the Revolt reveals, save validation and all eleven player
designs including native Messenger of the King setup. The complete-game matrix
plays fourteen games with exact save restoration after every action, physical
conservation and private-view checks at every boundary, and six exact
review-mode comparisons. The browser suite uses real controls at 1280, 390
and 320 pixels and checks all 42 served image hashes and decodes.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
