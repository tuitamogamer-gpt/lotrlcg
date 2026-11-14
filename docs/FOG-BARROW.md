# Fog on the Barrow-downs

A standalone scenario (2014 Fellowship event, print-on-demand recipe Q99.05)
set between The Old Forest and A Knife in the Dark. It is playable in classic
solo and with one to four local players, in normal and easy mode, with the
Ring-bearer rules of The Lord of the Rings Saga. Its campaign mode, which
continues The Black Riders campaign with the campaign card and its boons, is
not part of this import.

## Sources and corrections

- The Saga rules follow the earlier Saga imports: the first player controls
  Frodo Baggins with The One Ring, each player reveals his own encounter card
  in player order, "you" is the revealing player, and Peril cards are
  resolved by the revealing player. Losing The One Ring loses the game.
- A Great Barrow gives its player **his own staging area** at a separate stage
  4A. The separate staging areas follow The Road Darkens rules used by
  Breaking of the Fellowship: each stage has its own staging area, active
  location and progress, reveals its own cards, resolves its own quest and
  makes its own travel decision, and "each player" on an encounter card means
  each player at that stage.
- Recipe Q99.05 matches the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Fog-on-the-Barrow-downs):
  41 and 32 encounter cards without the campaign card, the quest cards, Frodo
  Baggins and The One Ring. The catalog has no easy recipe, so Hall of Beorn's
  easy quantities build one: 2 Ancient Barrow, 3 Barrow-wight, 1 Dreadful
  Song, 2 Frozen by Fear, 3 Great Barrow, 3 Stone Ring and no I'm Waiting for
  You!. The quantities are recorded in
  `tests/fog-barrow-source-quantities.json`. Hall of Beorn lists one stage 4
  card; the recipe keeps the catalog's **four copies of Trapped Inside a
  Barrow**, one for each player, because every trapped player advances to a
  separate stage 4A by himself. Hall of Beorn's community rating of 7.8 gives
  the atlas difficulty of 8.
- The immutable snapshot `src/data/pending/fog-on-the-barrow-downs-import.json`
  has SHA-256
  `481b1e3b4a296a9268423bfe9c07f230da4e88115e879aaf968309def5731ab4`.
- `tests/fog-barrow-art.json` pins all **25 faces**. They were checked by eye
  and correct the catalog:
  - Trapped Inside a Barrow keeps its name on the reverse (the catalog has
    "Inside the Barrow"), its front reads "When Revealed: End your quest
    phase", and the reverse combines the staging areas "with stage 3B".
  - Dreadful Song attaches to a questing **hero** (the catalog has
    "character").
  - I'm Waiting for You! "gains surge" in lower case.
  - Tom Bombadil is unique.
  - The quest points (1, 14, 16 and 9) and the enemy and location statistics
    come from the scans; Ancient Barrow's threat is X.
  - Paragraphs follow the cards and double spaces are removed.

## Stages

| Stage                            | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The House of Tom Bombadil  | 1            | Setup: each copy of Great Barrow, Standing Stones and Hollow Circle is set aside, out of play, and the encounter deck is shuffled. The players skip the quest phase. Forced: at the end of the round, 1 progress is placed on this stage, which defeats it.                                                                                                                                                                                                                                                                                                                                         |
| 2A/2B Across the Downs           | 14           | When Revealed: Hollow Circle enters the staging area and each player reveals 1 encounter card. Forced: at the end of the refresh phase, each player raises his threat by 1. The players cannot defeat this stage unless Hollow Circle is in the victory display.                                                                                                                                                                                                                                                                                                                                    |
| 3A/3B Lost in the Fog            | 16           | When Revealed: the first player adds Standing Stones to the staging area, each other player reveals 1 encounter card, and the encounter discard pile and each copy of Great Barrow are shuffled into the encounter deck. No progress is placed here while a Great Barrow is in play. Forced: after a player is eliminated (at any stage), each player at this stage raises his threat by 10. The players win by defeating this stage with each player in the game at it and Standing Stones in the victory display.                                                                                 |
| 4A/4B Trapped Inside a Barrow ×4 | 9            | When Revealed: the player's quest phase ends at this stage without resolving the quest; encounter cards are discarded until a Wight enemy is discarded, which is added to this staging area; the player discards all but X allies, where X is the number of enemies engaged with him. Forced: a location revealed at this stage is cancelled and discarded, and the player raises his threat by its threat. Forced: after this stage is defeated, the player advances to stage 3B at the beginning of the travel phase, combining the staging areas, and places 1 progress on a Great Barrow there. |

## Encounter cards

| Card                 | Behaviour                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Great Barrow         | Peril. Immune to player card effects; the players cannot travel here; Victory 5. Forced: after it enters the staging area, the player removes each character he controls from the quest, creates his own staging area and advances to a separate stage 4A by himself. |
| Standing Stones      | Unique, Immune to player card effects, Victory 3. Travel: the first player searches the encounter deck, discard pile and victory display for a Great Barrow and adds it to the staging area; the encounter deck is shuffled.                                          |
| Hollow Circle        | Unique, Immune to player card effects, Victory 3. Travel: each player searches the encounter deck and discard pile for a Wight enemy and puts it into play engaged with him; the encounter deck is shuffled.                                                          |
| Ancient Barrow       | X threat, 1 plus the number of facedown cards under it. Forced: after it enters play, each player places an ally he controls facedown under it; when it leaves play as an explored location, each of those allies returns to its owner's hand.                        |
| Stone Ring           | While it is in the staging area, each Wight engaged with a player at its stage gets +1 attack and +1 defense and applies the first sentence of its text to each player at that stage.                                                                                 |
| North Downs          | While it is in the staging area, characters defend against Wights with their willpower. Shadow: +2 attack; if the attack destroys a character, each player raises his threat by 2.                                                                                    |
| Barrow-wight         | The engaged player's threat cannot be reduced. Forced: after its attack destroys a character, that character's controller raises his threat by 2.                                                                                                                     |
| Dark-wight           | The engaged player's heroes cannot gain resources from card effects. Forced: after its attack destroys a character, that character's controller discards all resources from his heroes.                                                                               |
| Cold-wight           | The engaged player cannot draw cards from card effects. Forced: after its attack destroys a character, that character's controller discards a random card from his hand.                                                                                              |
| Tom Bombadil         | Unique objective ally. When Revealed: a chosen player gains control of him, ready and committed to the quest. At the end of the round he is discarded and the encounter discard pile is shuffled into the encounter deck. This cannot be cancelled.                   |
| Dreadful Song        | Peril. Attaches to a questing hero the player controls as a Condition: limit 1 per hero, the hero's willpower is 0, and at the end of the round its controller raises his threat by 1 for each Wight engaged with him.                                                |
| Long Groping Arm     | Peril. Until the end of the phase, each Wight engaged with the player contributes its threat to the staging area. Without an engaged enemy, the player puts a Wight from the encounter deck or discard pile into play engaged with him; the deck is shuffled.         |
| Chill Fog            | Every resource in play is discarded and each player raises his threat by the resources he discarded; without one it gains surge. Shadow: the defending player raises his threat by 1 for each damage the attack deals.                                                |
| I'm Waiting for You! | Each Wight engaged with a player makes an immediate attack; without one it gains surge. Shadow: +1 attack, +3 against a defending ally. Normal mode only.                                                                                                             |
| Frozen by Fear       | Surge, Doomed 1. Until the end of the round, the players cannot trigger Action or Response effects. Shadow: the attacking enemy cannot take damage until the end of the round.                                                                                        |

Interpretations:

- **Each trapped player** has his own barrow area. While some players are
  trapped, stage 3B keeps its staging area, active location and progress,
  even with no player at it; once every barrow has returned, the staging
  areas are one again. Staging, quest resolution and travel go stage by stage
  in first-player order, and a barrow whose quest phase ended (4A) does not
  resolve its quest that round. A Great Barrow revealed by a player who is
  already trapped does nothing more.
- **4A in the travel phase** (Standing Stones' travel effect) does not end a
  quest phase. "Discard until a Wight enemy is discarded" stops when the
  encounter deck runs out, without shuffling the discard pile.
- **Defeating 4B** at any time sends the player back at the beginning of the
  next travel phase: his barrow's staging area, active location included,
  joins stage 3B's, and 1 progress is placed on a Great Barrow at 3B if there
  is one (explored, it goes to the victory display).
- **An eliminated player's barrow** is discarded with the encounter cards in
  its staging area; Lost in the Fog's forced effect then raises the threat of
  each player at stage 3B.
- **Ancient Barrow** takes only player allies (not Tom Bombadil). An ally
  under it is out of play; if the location leaves play without being explored,
  the allies go to their owners' discard piles.
- **Wights' forced effects** trigger once for each character destroyed by
  their attack, against that character's controller; Cold-wight's random
  discard uses the game's seeded random numbers.
- **Stone Ring** spreads only the first sentence (the restriction), and its
  +1/+1 counts each Stone Ring in that staging area.
- **Frozen by Fear** applies to the players at the revealing stage. While it
  lasts, events cannot be played, and Action and Response abilities on cards
  in play are disabled; Forced effects and the game's own decisions are not.
- **Dreadful Song's threat** is 1 for each Wight engaged with its controller,
  for each copy attached to his heroes.
- **Tom Bombadil** chooses among the players at the revealing stage; in solo,
  the player takes him. He leaves at the end of the round even if he left play
  before.

Engine additions:

- Scenario rules can stop heroes from gaining resources from card effects,
  stop a player from drawing cards from card effects, and block a player's
  Action and Response effects (abilities, events and response windows).
- The separate staging areas of Flies and Spiders now also serve Fog on the
  Barrow-downs, including a stage with no player at it.
- Breaking of the Fellowship's separated travel phase now passes from stage to
  stage instead of ending at the first stage's travel decision.

## Verification

```sh
npm run test:engine
npm run test:fog-barrow-simulation
npm run build
npm run test:browser-fog-barrow
npm run audit:rules
```

The focused suite (`tests/fog-barrow.test.ts`, 25 tests) covers setup in one
to four players and both difficulties, the three stages, the barrows and
their separate staging areas, the 4A ally discard, the 4B location
cancellation, separate staging, quest resolution and travel, the return to
3B, Standing Stones, the victory, elimination, every Wight and location, every
treachery and shadow, Tom Bombadil, saves and the scenario panel data. The
source test pins the snapshot, the normal and easy quantities, the corrections
and all 25 faces.

The complete-game matrix plays fourteen games from setup with exact save
restoration after every action, physical conservation (including every
staging area, the set-aside cards, the allies under Ancient Barrows and
treacheries being resolved) and private-view checks; the starter decks leave
the house of Tom Bombadil and lose them all Across the Downs. A second matrix
starts twelve games at stage 3B with the Great Barrows in the encounter deck:
in every game players are trapped inside the barrows and separated into their
own staging areas, and in six of them a player escapes and returns to Lost in
the Fog before the starter decks lose. Hidden and decisions review parity is
checked in both matrices. The victory is covered by the focused and browser
suites.

The browser suite runs eight native setups with exact physical inventories and
shows the four printed quest cards, Across the Downs, the 4A ally discard, a
trapped player's separate stage, the escape and the return to Lost in the
Fog, Ancient Barrow, Frozen by Fear, Tom Bombadil, the victory and a loss of
The One Ring at 1280/390/320px; it checks all 25 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
