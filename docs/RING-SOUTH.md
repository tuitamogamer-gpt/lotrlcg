# The Ring Goes South

The first scenario of **The Lord of the Rings: The Road Darkens** (October
2014), the second box of The Lord of the Rings Saga. It is playable in classic
solo and with one to four local players, in normal and easy mode. Campaign
mode, with its boons and burdens, is not part of this import; the box's other
player cards follow in a later import.

## Sources and corrections

- The Saga rules follow The Road Darkens rules insert, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-road-darkens/rulebook):
  the first player controls a Fellowship-sphere Ring-bearer carrying The One
  Ring, each player reveals his own encounter card in player order, and Peril
  cards are resolved by the revealing player. On stage 4A the Ring-bearer and
  the cards attached to it **remain in play** facedown under Watcher in the
  Water, but no player controls them; Doors of Durin is immune to player card
  effects, so those effects only reach the other active location.
- Recipes Q0B.04 and E0B.04 match the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Ring-Goes-South):
  33 and 26 encounter cards without the campaign card, plus 4 quest cards,
  Frodo Baggins and The One Ring. Stage 1A sets Lust for the Ring aside in every
  mode; the catalog's easy recipe omits it, so it is added there as in the
  standard recipe. The quantities are recorded in
  `tests/ring-south-source-quantities.json`. Hall of Beorn's community rating
  gives the atlas difficulty of 6.
- The immutable snapshot `src/data/pending/the-ring-goes-south-import.json`
  has SHA-256
  `2d0a620ddeaf95e542d0a3822b957855004973cbe71e37354ffe5516f25987aa`.
- `tests/ring-south-art.json` pins all **26 faces**. They were checked by eye
  and correct the catalog: the Council chooses a card "to be played" for 0
  cost, Watcher in the Water is "Indestructible", Howling Warg's shadow
  "destroys" a character, and the formatting tags and double spaces are gone.

## The Road Darkens Ring-bearer

The Road Darkens has its own Fellowship-sphere Frodo Baggins and its own The
One Ring; the Saga framework places the box's pair in its scenarios and keeps
The Black Riders' pair in The Black Riders and The Old Forest.

- **Frodo Baggins.** Response: after he exhausts to defend an attack, exhaust
  The One Ring and spend 1 Fellowship resource to target the attacking enemy;
  the attack deals no damage and each player raises his threat by 2. An enemy
  immune to player card effects cannot be targeted.

## Stages

| Stage                       | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Council of Elrond | –            | Setup: Lust for the Ring, Redhorn Pass, Doors of Durin and Watcher in the Water are set aside. Forced, at the end of the planning phase: each player places the top card of his deck faceup, in player order, until there are 4; the first player chooses 1 to be played for 0 cost by its owner, 1 for its owner's hand, 1 to discard and 1 to shuffle into its owner's deck. Then Lust for the Ring is shuffled into the encounter deck, or each player raises his threat by 5, and the players advance to stage 2. |
| 2A/2B The Nine Walkers      | 8            | When Revealed: Redhorn Pass becomes the active location and the first player reveals encounter cards until the staging area holds 2 threat per player. The players must travel to a location if able. Forced: after an enemy engages a player, 1 damage is placed on the active location.                                                                                                                                                                                                                             |
| 3A/3B The Hunt is Up!       | 12           | When Revealed: each player searches the encounter deck and discard pile for an enemy for the staging area; the first must be Great Warg Chief, if able. As 2B, and each location that enters play gets 1 damage.                                                                                                                                                                                                                                                                                                      |
| 4A/4B The Gates of Moria    | –            | When Revealed: Doors of Durin becomes the active location, Watcher in the Water is added to the staging area, and the Ring-bearer loses all tokens and goes facedown under the Watcher with his attachments. There can be 2 active locations; the players must travel if able; after an enemy engages a player, 1 damage is placed on each active location. Exploring Doors of Durin wins.                                                                                                                            |

Damage on a location is a token count: explored Hills use it as their X.

## Encounter cards

| Card                 | Behaviour                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watcher in the Water | Indestructible; immune to player card effects; cannot leave the staging area and is considered engaged with each player, attacking each with a new shadow card. Forced: after its 6th damage, the first player takes control of the Ring-bearer, exhausted with 1 damage. |
| Doors of Durin       | Immune to player card effects. Progress goes on each other active location first, and only while the first player controls the Ring-bearer. 9 damage tokens lose the game.                                                                                                |
| Great Warg Chief     | Cannot have attachments. After it engages you, encounter cards are discarded until a Warg enemy is discarded; that enemy enters play engaged with you.                                                                                                                    |
| Hound of Sauron      | Surge. -5 engagement cost per enemy in the staging area. Shadow: +1 attack, +2 if the attacker engaged this round.                                                                                                                                                        |
| Howling Warg         | Forced: when it attacks, 1 damage on an active location. Shadow: +1 attack; a destroyed character places 1 damage on an active location.                                                                                                                                  |
| Crebain from Dunland | Peril. Exhaust a hero you control, or engage it; after it engages a player, the top encounter card is revealed.                                                                                                                                                           |
| Redhorn Pass         | Immune; Victory 1. Explored: each player assigns X damage among his characters.                                                                                                                                                                                           |
| Tree-crowned Hill    | While active, enemies get -1 threat. Explored: the players exhaust X characters.                                                                                                                                                                                          |
| Hills of Hollin      | While active, enemies in the staging area get +5 engagement cost. Explored: each player raises his threat by X.                                                                                                                                                           |
| Redhorn Foothills    | While active, an enemy added to the staging area gets -5 engagement cost until the end of the round. Explored: each player discards X random cards from his hand.                                                                                                         |
| Eregion              | Explored: the players discard X allies from play. Shadow: the defending player discards a non-objective attachment he controls.                                                                                                                                           |
| Regiments of Crows   | 3 damage on each active location. Shadow: undefended damage goes to the active location (the first player chooses with two).                                                                                                                                              |
| Snowdrifts           | Condition on an active location (one per location): no more than 3 progress on it each round; without one it surges.                                                                                                                                                      |
| Bitter Cold          | Each player discards each ally he controls or raises his threat by 1 per ally. Shadow: an additional attack.                                                                                                                                                              |
| Storm of Howls       | Peril. The Warg in the staging area with the highest engagement cost attacks you, or each Warg gets -20 engagement cost this round; without a Warg it surges.                                                                                                             |
| Lust for the Ring    | Peril. Surge. Condition on a non-Fellowship hero: after The One Ring exhausts, each player raises his threat by 1 and the hero's willpower is 0 until the end of the round.                                                                                               |

Interpretations:

- **The Council's play** is made by the card's owner, at no cost, with its
  normal restrictions and targets; a card that cannot be played now cannot be
  chosen, and when none can, none is played. The other assignments follow.
- **"Make X the active location"** returns a previous active location to the
  staging area.
- **Progress on a capped location** (Snowdrifts) that it cannot take goes on
  the current quest, as excess progress does.
- **A second active location** on 4B is entered by travelling while Doors of
  Durin is active.

Engine additions:

- The Saga framework supports more than one Ring-bearer and One Ring, with
  The Road Darkens' Frodo response; an effect can make an attack deal no
  damage.
- Scenario hooks for a per-round progress cap on a location, for active
  locations that take progress in a fixed order, and for The One Ring
  exhausting.

## Verification

```sh
npm run test:engine
npm run test:ring-south-simulation
npm run build
npm run test:browser-ring-south
npm run audit:rules
```

The focused suite (`tests/ring-south.test.ts`, 9 tests) covers setup in one to
four players and both difficulties, the Council of Elrond, the four stages,
the Watcher and the Ring-bearer, Doors of Durin, Frodo's response with Lust for
the Ring, every encounter card and shadow, saves and the scenario panel. The
source test pins the snapshot, the normal and easy quantities and all 26
faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including the Council's faceup
cards, the set-aside cards and treacheries being resolved) and private-view
checks. Every game passes the Council of Elrond into stage 2, where the
starter decks lose; stages 3 and 4 and the victory are covered by the focused
and browser suites. The A Shadow of the Past, A Knife in the Dark, Flight to
the Ford and The Old Forest matrices replay exactly the same actions with the
generalised Ring-bearer.

The browser suite runs eight native setups with exact physical inventories and
shows the four printed quest stages, the Council of Elrond and stage 2, The
Hunt is Up!'s search, the Watcher holding the Ring-bearer, Frodo's response,
the victory at Doors of Durin and its loss to 9 damage at 1280/390/320px; it
checks all 26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
