# The Mountain of Fire: epic multiplayer mode

The Mountain of Fire's **Epic Multiplayer Mode** plays
[The Black Gate Opens](BLACK-GATE.md) and [Mount Doom](MOUNT-DOOM.md) at once:
two teams of one to four local players, one for each scenario, with no more
players at Mount Doom than at The Black Gate Opens. The Black Gate Opens'
team holds the Morannon while Mount Doom's team carries the Ring to the Crack
of Doom; The Eye of Sauron watches one of them at a time. It is offered in the
hot-seat lobby for either scenario (each team plays with the table's decks),
in normal and easy mode, outside campaign mode.

## Sources and corrections

- `src/data/mof-epic-cards.json` holds the epic multiplayer cards, reviewed
  face by face against the DragnCards scans: the Epic Multiplayer Mode setup
  card (both faces), In Darkness Bind Them (two copies, one for each encounter
  deck) and the two sides of The Eye of Sauron (1/4, Mount Doom, and 2/4, The
  Black Gate Opens; both unique). `tests/mof-epic-art.json` pins their **5
  faces**.
- **Corrections from the scans:** the setup card's back reads "if the last
  player at either scenario is **eliminated**" (the catalog says "defeated"),
  keeps its three paragraphs and drops the flavour text; The Eye of Sauron's
  Mount Doom side reads "Add [sauron] to each Fortitude test" (the catalog's
  "(S)"); both sides of The Eye of Sauron print the unique symbol.
- The rules follow the box's rulebook (as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-mountain-of-fire/rulebook)):
  each scenario is its own game with its own staging area and encounter deck;
  players at one scenario are the only players in the game there, and player
  cards cannot affect the other scenario; Aragorn joins The Black Gate Opens'
  first player and the Ring-bearer Mount Doom's.

## Setup and turns

Each team sets its scenario up as usual. Then a copy of In Darkness Bind Them
is shuffled into each encounter deck, and The Eye of Sauron is placed in the
Mount Doom staging area with its Mount Doom side faceup.

The teams take turns within each round, on the epic framework of
[The Siege of Annúminas](ANNUMINAS.md#epic-multiplayer-mode): The Black Gate
Opens' team plays the round, then Mount Doom's; then the end of the round
resolves for The Black Gate Opens, then for Mount Doom, and the next round
begins. A team that ends its round waits until the other is ready. The table
heading names the active team, and the epic panel shows both teams, their
stages and players, and where The Eye of Sauron is.

## The cards

| Card                                     | Behaviour                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Epic Multiplayer Mode                    | Next to the Mount Doom quest deck. At the end of the round, Mount Doom's first player chooses a scenario: each player there draws 1 card and each player at the other reduces his threat by 3. Then the player who controls Gwaihir may give him to another player at either scenario. |
| The Eye of Sauron (The Black Gate Opens) | Each enemy in the staging area gets +1 threat and -10 engagement cost.                                                                                                                                                                                                                 |
| The Eye of Sauron (Mount Doom)           | Each Fortitude test has 1 more Sauron's Eye icon.                                                                                                                                                                                                                                      |
| The Eye of Sauron (both sides)           | At the end of the round it flips and moves, with each Nazgûl enemy in its staging area, to the other scenario's staging area, unless the first player there raises each player's threat by 3.                                                                                          |
| In Darkness Bind Them                    | Each player exhausts a character he controls; with The Eye of Sauron in the staging area, no player card readies a character this round. Shadow: with The Eye of Sauron in the staging area, the attacking enemy gets +2 attack and returns to the staging area after the attack.      |

**The end of the game**: if Mount Doom is defeated, both teams win; if the
last player at either scenario is eliminated, or either scenario is lost
otherwise (Aragorn or The One Ring leaving play, the last Fortitude test
failed), both teams lose. The Black Gate Opens has no score in epic mode.

Interpretations:

- **The Eye of Sauron moves once a round**: its Forced effect resolves at the
  end of the round of the scenario where it is; carried to Mount Doom at The
  Black Gate Opens' end of the round, it does not move again at Mount Doom's.
  The first player of the scenario it leaves decides on the threat.
- **The Epic Multiplayer Mode card's first player** is Mount Doom's, at
  Mount Doom's end of the round (the card lies next to its quest deck). The
  draws and threat reductions at The Black Gate Opens wait for that team's
  next turn, before anything else it does, and so does a choice by Gwaihir's
  controller there. The threat reduction is an encounter-side effect: Dire
  does not limit it.
- **Carried Nazgûl keep their text**: Nazgûl of Mordor at Mount Doom still
  asks the defending player to raise his threat by 4 or return it to the
  staging area after it attacks, and still takes no non-Morgul attachment; a
  Hell-hawk attached to it still gives +2 threat, attack and defense and
  immunity. Ringwraith of Sauron at The Black Gate Opens takes no non-Morgul
  attachment (no Fortitude test is made there). A moved card keeps its damage
  and attachments.
- **Gwaihir** given to a player at the other scenario joins that player's
  game; leaving play, he goes to that encounter discard pile.
- **In Darkness Bind Them** marks the round in which characters cannot be
  readied by player card effects; encounter and quest effects still ready
  them.
- **Campaign mode**: the rulebook offers the epic mode as the saga
  campaign's grand finale (with the campaign cards' setups, the Ring-bearer's
  controller placing a boon or burden that both setups name, and the Mount
  Doom campaign card's Forced effect ignored). That finale is not offered
  yet; the epic mode is played as a standalone adventure.

## Verification

```sh
npm run test:engine
npm run build
npm run test:browser-mount-doom
npm run audit:rules
```

The epic suite (`tests/mof-epic.test.ts`, 11 tests) checks the cards against
the scans and their 5 faces; setup for teams of one to four players
(Aragorn, the Ring-bearer, In Darkness Bind Them in each encounter deck and
The Eye of Sauron at Mount Doom) and the team limits; the turn order; both
sides of The Eye of Sauron and its move with a Nazgûl carrying a Hell-hawk,
once a round, or its cancel; In Darkness Bind Them and its shadow; the Epic
Multiplayer Mode card's choice with Gwaihir given to a player at Mount Doom;
the carried Nazgûl; the win and the losses for both teams; save validation
against tampering, a retried game with the same teams; the panel; and seeded
games for teams of one to four players. The Mount Doom browser suite starts
an epic game from the lobby's switch, ends The Black Gate Opens' round on the
table to begin Mount Doom's turn, moves The Eye of Sauron with a Nazgûl from
its choice, and shows the epic panel at 1280, 390 and 320 pixels with the
cards' 5 faces checked.
