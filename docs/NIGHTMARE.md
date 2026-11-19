# Nightmare mode

A Nightmare Deck turns a scenario into its Nightmare variant: its setup card
lists the encounter cards it removes from the scenario's standard encounter
deck, its own encounter cards are shuffled into the rest, and the setup card
is flipped next to the quest deck, its rules active for the whole game.
Nightmare mode is offered in the lobby (next to easy mode, which it replaces)
for each scenario whose Nightmare Deck is supported; the scenario archive's
Nightmare list of such a scenario offers it too ("Choose adventure"). It is
not offered in campaign mode.

**Supported so far:** the Core Set Nightmare Deck (Passage Through Mirkwood,
Journey Along the Anduin and Escape from Dol Guldur) and, of Shadows of
Mirkwood's, The Hunt for Gollum. The other Nightmare Decks follow in
publication order, beginning with Conflict at the Carrock.

## Sources

- The card texts are the DragnCards data in the imported catalogue
  (`public/catalog.json`), checked by eye against the DragnCards scans; the
  checked cards are written to `src/data/nightmare-encounter-cards.json` and
  their faces pinned in `tests/nightmare-art.json` (9 cards and 10 faces for
  each scenario so far).
- The scans correct the catalogue: each setup card's front is the removal
  list ("Begin with the standard quest deck and encounter deck … Remove the
  following cards, in the specified quantities …"), where the catalogue had a
  generic text; Glade of the Spawn begins "While Glade of the Spawn is the
  active location"; The Spider's Web "Counts as a Condition attachment";
  Ungoliant's Spawn's shadow raises "defending player's threat" (the
  catalogue misspelled "theat"); Gladden Marshlands' shadow gives +1 [attack]
  to each enemy engaged with the "defending player" (the catalogue had
  "defending character"); Sentinel of Shadow names the "Nazgul" (the
  catalogue had "Nazul"), Torture Chamber places a "resource token", and
  Catacomb Inspection's shadow closes its parenthesis; The Hunt for Gollum's
  setup card detaches "the encounter guarding it first" (the catalogue had
  "guarding if first") and Hunting Warg searches for "Hunters from Mordor"
  (the catalogue had "Morder").
- The source recipe of each Nightmare scenario (`public/scenarios.json`,
  N01.1 to N01.4 so far) is the standard encounter deck without the
  printed removals plus the Nightmare Deck (Escape from Dol Guldur's Nazgûl
  set aside in both): a test compares the two.

## The framework

- `src/game/nightmare.ts` holds the supported Nightmare Decks (setup card and
  printed removals by title), builds the Nightmare encounter deck from the
  standard one, and gives the quest inspector its Nightmare card and lines.
- A game in Nightmare mode keeps `nightmareMode` (never with easy mode); the
  scenario's own setup then runs on the Nightmare encounter deck, and the
  setup card's setup rule follows.
- `src/game/nightmare-core.ts` (the Core Set) and `src/game/nightmare-som.ts`
  (Shadows of Mirkwood) script the setup cards' rules and the Nightmare
  encounter cards as a layer, chosen by scenario and composed with its hooks
  (the composition the Ered Mithrin Campaign Pool uses, which also composes
  the doomed and combat-phase hooks, the state check, the indestructible,
  attack and defense prohibitions a Nightmare layer adds), so the standard
  encounter cards keep their own scripts. Its lasting effects are saved with
  the game and checked when a save is restored; a Nightmare card's threat
  raise resolves in the affected player's own seat.
- The quest inspector shows the Nightmare card (its rules side first) and the
  rule it applied; the end-of-game log names the mode.
- The coverage audit counts a Nightmare recipe as automated once its
  scenario's Nightmare Deck is supported.

## Passage Through Mirkwood (Nightmare)

| Card                             | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup card                       | Removes Ungoliant's Spawn ×1, Black Forest Bats ×1, Forest Spider ×3, Dol Guldur Orcs ×3, Old Forest Road ×1, Forest Gate ×2, Mountains of Mirkwood ×3 and Caught in a Web ×2 from the standard encounter deck (the scenario's setup still adds the last Forest Spider and Old Forest Road to the staging area). Forced: during setup, each player reveals 1 card from the encounter deck and adds it to the staging area. |
| Abandoned Camp (location ×3)     | Immune to player card effects. After it leaves play (explored or discarded), each exhausted character takes 2 damage. Shadow: if the attack is undefended, each attachment card players control is discarded.                                                                                                                                                                                                              |
| Backtrack! (treachery ×2)        | Surge. The topmost enemy or location of the encounter discard pile returns to the staging area. Shadow: the topmost card with a Shadow effect in the encounter discard pile is dealt to the attacking enemy and resolved in this attack.                                                                                                                                                                                   |
| Forest Flies (enemy ×3)          | After a player engages it, each exhausted character they control takes 1 damage. Shadow: an Insect attacker is dealt 2 more shadow cards.                                                                                                                                                                                                                                                                                  |
| Glade of the Spawn (location ×2) | While it is the active location: after a Spider enemy enters play (revealed, or returned by Backtrack!), each player exhausts a character they control.                                                                                                                                                                                                                                                                    |
| Spiders of Mirkwood (enemy ×2)   | +1 [attack] for each exhausted character of the player it is engaged with. Shadow: the defending player exhausts a character they control, which also takes 2 damage if the attack was undefended.                                                                                                                                                                                                                         |
| The Spider's Web (treachery ×3)  | The player with the highest threat (the first in turn order among equals) exhausts each hero they control and attaches it to one of them; each time that hero readies it takes 1 damage.                                                                                                                                                                                                                                   |
| Ungoliant's Brood (enemy ×3)     | After a player engages it, their cards cannot ready for the rest of the round. Shadow: if the attack is undefended, each character the defending player controls is exhausted.                                                                                                                                                                                                                                             |
| Ungoliant's Spawn (enemy ×1)     | When revealed: the characters committed to the quest get -2 [willpower] until the end of the phase (as the Core Set's Ungoliant's Spawn, through the quest phase's willpower penalty), and one brought to 0 [willpower] is discarded. Shadow: the defending player's threat rises by 5 (10 if undefended).                                                                                                                 |

## Journey Along the Anduin (Nightmare)

| Card                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup card                          | Removes Evil Storm ×3, Treacherous Fog ×2, Banks of the Anduin ×2, Dol Guldur Orcs ×3, Enchanted Stream ×2, Despair ×2, Misty Mountain Goblins ×3 and Necromancer's Pass ×2 from the standard encounter deck. Troll enemies cannot have attachments. When the encounter deck is empty, at any time (a shadow card dealt from it included), the encounter discard pile is shuffled back into it. |
| A Flooded Ford (location ×2)        | Each card revealed by the encounter deck gains doomed X, X the progress tokens on each A Flooded Ford in play. Shadow: if the attack is undefended, it enters the staging area (instead of the discard pile) with 1 progress token.                                                                                                                                                             |
| Anduin Troll Spawn (enemy ×3)       | Gains surge when no Hill Troll is in play. At the beginning of the combat phase, each copy not yet engaged with the player engaged with a Hill Troll engages that player (the first in turn order if two players are).                                                                                                                                                                          |
| Brown Water Rats (enemy ×3)         | Prints no hit points and cannot be damaged, so it is never destroyed. On stage 3, once only Rat enemies remain (outside an attack), each copy is discarded from play, which lets the players win. Shadow: the attacking enemy cannot be damaged this round.                                                                                                                                     |
| Gladden Marshlands (location ×3)    | Action (any player, from its card in play): deal 1 damage to a hero you control to give it −1 [threat] until the end of the phase (refused once its threat is 0). Shadow: each enemy engaged with the defending player gets +1 [attack] until the end of the phase (+2 if the attack is undefended).                                                                                            |
| Marshland Outlaws (enemy ×2)        | A player engaged with it cannot declare attacks against, or deal damage through player card effects to, an enemy with another title. Shadow: after the attack, the defending player raises their threat by the damage it dealt.                                                                                                                                                                 |
| Pursuit on the Shore (treachery ×2) | Cannot be canceled. The enemy with the most printed hit points in the victory display or the encounter discard pile returns to the staging area (the first player chooses among tied cards); with none, it gains surge.                                                                                                                                                                         |
| Smoking Blood (treachery ×2)        | All damage leaves every enemy; each player raises their threat by the damage removed from the enemies engaged with them; with none removed, it gains surge. Shadow: the attacker's damage moves to the defending character, or, if the attack is undefended, to the hero the attack damaged (after the attack).                                                                                 |
| Troll Attack (treachery ×2)         | Each engaged Troll enemy makes an attack against its player (dealt a shadow card, as the engine's other immediate attacks); with none engaged, it gains surge. Shadow: if the attacker is a Troll, the attack then resolves against each other player in turn order, undefended, with the attack's bonus from its shadow cards (no new shadow card).                                            |

## Escape from Dol Guldur (Nightmare)

| Card                               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup card                         | Removes Dol Guldur Orcs ×2, Enchanted Stream ×2, Great Forest Web ×1, Mountains of Mirkwood ×3, Caught in a Web ×2, The Necromancer's Reach ×1, Necromancer's Pass ×1, Under the Shadow ×2, Tower Gate ×2 and Iron Shackles ×1 from the standard encounter deck. When stage 1B is revealed, 1 hero is captured with 1 or 2 players, 2 with 3 players and 3 with 4, each of a different player (the scenario's prisoner, then random heroes of the other players). Every captured hero is “the prisoner”: the prison banner names each, a player whose heroes are all held is not eliminated, and the stage 2 rescue frees each of them with 1 damage. The Nazgûl of Dol Guldur moves into the staging area on a rescue (it enters from out of play only if it never has). |
| Catacomb Inspection (treachery ×2) | Surge. Each Dol Guldur location in play gets 1 resource token. Shadow: each of the defending player's heroes with a resource moves 1 to each Dol Guldur location in the staging area.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Crazed Captive (enemy ×2)          | Doomed 1. When it is defeated, each player raises their threat by 7. Shadow: unless the attacking enemy is defeated by the end of the phase (the combat phase, or the round for another), the defending player raises their threat by 7.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Dark Interrogation (treachery ×2)  | Each player with more than 2 cards in hand discards cards of their choice down to 2; each player with 2 or fewer reveals 1 card from the encounter deck. Shadow: each character and attachment the defending player controls with a copy (same title) in their discard pile is discarded; each player's if the attack is undefended.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Dungeon Labyrinth (location ×3)    | +1 [threat] and +1 quest point for each resource token on it. At the end of each round, it gets 1 resource token for each player.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sentinel of Shadow (treachery ×2)  | Cannot be canceled. The staging area gets +2 [threat] for each player until the end of the phase; if the players quest unsuccessfully this phase, the Nazgûl of Dol Guldur enters play engaged with the first player (from the encounter discard pile or set aside), unless it is already in play.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Spider of Dol Guldur (enemy ×3)    | Gains surge while an objective is unclaimed in the staging area. Shadow: the attacking enemy gets +3 [attack] for each unclaimed objective.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Torture Chamber (location ×2)      | At 4 resource tokens on it, the players lose. At the end of each round, each Dol Guldur location in play gets 1 resource token (for each Torture Chamber in play).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Torture Master (enemy ×3)          | When revealed, each Dol Guldur location in play gets 1 resource token. Shadow: after the attack, each hero it damaged and did not destroy is captured as a prisoner (held with the scenario's prisoner, or as it); then, on stage 3, the players return to stage 2B, Through the Caverns (its progress gone).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## The Hunt for Gollum (Nightmare)

| Card                               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup card                         | Removes River Ninglor ×2, The Eaves of Mirkwood ×1 (printed "Eaves of Mirkwood"), False Lead ×2, Misty Mountain Goblins ×2, Banks of the Anduin ×2, Gladden Fields ×3, Eastern Crows ×3, Treacherous Fog ×2 and Evil Storm ×3 from the standard encounter deck. At the end of each refresh phase (the end of the round), the first player chooses an unclaimed Clue in the staging area (its guard, if any, is detached) and a Mordor enemy in play, which carries it as an attachment and guards it; when that enemy leaves play, the Clue returns to the staging area, unguarded. Clues on Mordor enemies are in play (Hunters from Mordor counts them). With 4 Clues on Mordor enemies at any time, the players lose. |
| The Enemy's Trail (treachery ×2)   | A Clue from the encounter discard pile is attached to a Mordor enemy in play (the first player chooses among several); if none is, it gains surge. Shadow: the same, without surge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Restless Hunters (treachery ×3)    | Surge. The first player moves a Clue attached to a hero to a Mordor enemy in play (the Clue does not leave play). Shadow: an undefended attack's damage goes to a hero with a Clue that the defending player controls (their choice among several).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| The Trail Goes Cold (treachery ×2) | Attached to the active location (1 per location), whose progress is removed; during the quest phase the location's [threat] counts as if it were in the staging area; with no active location (or one already attached), it gains surge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Ravenous Hawk (enemy ×3)           | When a stage's look (stages 1B and 2B) includes it, it enters play engaged with the first player, and the player reveals one of the other cards looked at (the looks of player cards are not covered).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Hunting Warg (enemy ×2)            | At the beginning of the refresh phase (a hook the engine gains for it), each copy that entered play this round brings 1 Hunters from Mordor from the encounter deck or discard pile into the staging area, and the deck is shuffled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Watched Path (location ×2)         | While it is in play, a player who controls no Clue cannot draw cards through card effects. Shadow: the defending player without a Clue discards their hand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Hunter's Lookout (location ×2)     | Each Mordor enemy with a Clue gets +2 [defense] for each copy in play. Shadow: the attacking enemy gets +1 [defense] for each Clue in play until the end of the round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Dark Pools (location ×3)           | No progress can be placed on it in the staging area. When it becomes the active location, each player discards one of their allies with the highest printed cost (their choice among tied allies).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Verification

```sh
node --import tsx --test tests/nightmare-core.test.ts tests/nightmare-anduin.test.ts tests/nightmare-dol-guldur.test.ts tests/nightmare-gollum.test.ts
npm run build
npm run test:browser-nightmare
```

`tests/nightmare-core.test.ts` (7 tests) covers the texts, stats and faces;
the Nightmare encounter deck against the source recipe and the printed
removals; the audit's Nightmare recipes; the setup (the reveal for one and two
players, the mode replacing easy mode, refused for an unsupported scenario,
and its save checks); each card's rules (Abandoned Camp leaving play and
its shadow, Backtrack!'s return, surge and shadow, Glade of the Spawn, Forest
Flies, Spiders of Mirkwood, Ungoliant's Brood, Ungoliant's Spawn and The
Spider's Web in a two-player game); and a threat raise in the defending
player's own seat in a two-player game.
`tests/nightmare-anduin.test.ts` (8 tests) covers Journey Along the Anduin's
texts, stats and faces; its Nightmare encounter deck against the source
recipe; its setup rules (Trolls and attachments, the refilled deck, a shadow
card dealt from it); each card's rules and shadow (the Marshlands' Action
through a restored save, the Outlaws' threat raise and Troll Attack's
attacks against the other player in two-player games); its save checks; and
seeded games of Journey Along the Anduin and Passage Through Mirkwood,
played to their end with a valid save after each action
(`tests/nightmare-fixtures.ts`). `tests/nightmare-dol-guldur.test.ts` (7
tests) covers Escape from Dol Guldur's texts, stats and faces; its Nightmare
encounter deck against the source recipe; the prisoners of 1 to 4 players and
their rescue (the Nazgûl moved rather than doubled); each card's rules and
shadow (the resource tokens, Torture Chamber's loss, Torture Master's
prisoners and the return to stage 2B, Dark Interrogation in a two-player
game); and seeded solo and three-player games played to their end.
`tests/nightmare-gollum.test.ts` (6 tests) covers The Hunt for Gollum's
texts, stats and faces; its Nightmare encounter deck against the source
recipe; the Clue attached to a Mordor enemy at the end of the refresh phase
(a choice among Clues, the guard detached, the Clue back in the staging area
when its enemy leaves play) and the loss at 4; each card's rules and shadow
(Ravenous Hawk in a stage's look, Hunting Warg at the beginning of the refresh
phase, Watched Path's draw prohibition); and seeded solo and two-player
games.

The browser suite starts Passage Through Mirkwood in Nightmare mode from the
lobby (easy mode turned off), checks the setup's staging area and reveal, the
Nightmare card in the quest inspector and its rules side, and attaches The
Spider's Web through its choice; it then starts Journey Along the Anduin in
Nightmare mode from the lobby, checks its Nightmare card, and triggers
Gladden Marshlands' Action from the staging area through its choice; and
it starts Escape from Dol Guldur in Nightmare mode from the lobby, checks its
Nightmare card, and a second prisoner in the prison banner with the table's
“Nightmare mode” label; and it starts The Hunt for Gollum in Nightmare mode
from the lobby, checks its Nightmare card and a Clue attached to Hunters from
Mordor, at 1280, 390 and 320 pixels (30 checkpoints); it checks the 40 pinned
faces.
