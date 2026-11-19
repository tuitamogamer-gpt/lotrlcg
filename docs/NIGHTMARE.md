# Nightmare mode

A Nightmare Deck turns a scenario into its Nightmare variant: its setup card
lists the encounter cards it removes from the scenario's standard encounter
deck, its own encounter cards are shuffled into the rest, and the setup card
is flipped next to the quest deck, its rules active for the whole game.
Nightmare mode is offered in the lobby (next to easy mode, which it replaces)
for each scenario whose Nightmare Deck is supported; the scenario archive's
Nightmare list of such a scenario offers it too ("Choose adventure"). It is
not offered in campaign mode.

**Supported so far:** Passage Through Mirkwood and Journey Along the Anduin
(the Core Set Nightmare Deck's first two scenarios). The other Nightmare
Decks follow in publication order, beginning with Escape from Dol Guldur.

## Sources

- The card texts are the DragnCards data in the imported catalogue
  (`public/catalog.json`), checked by eye against the DragnCards scans; the
  checked cards are written to `src/data/nightmare-encounter-cards.json` and
  their faces pinned in `tests/nightmare-art.json` (9 cards and 10 faces for
  each of Passage Through Mirkwood and Journey Along the Anduin).
- The scans correct the catalogue: each setup card's front is the removal
  list ("Begin with the standard quest deck and encounter deck … Remove the
  following cards, in the specified quantities …"), where the catalogue had a
  generic text; Glade of the Spawn begins "While Glade of the Spawn is the
  active location"; The Spider's Web "Counts as a Condition attachment";
  Ungoliant's Spawn's shadow raises "defending player's threat" (the
  catalogue misspelled "theat"); Gladden Marshlands' shadow gives +1 [attack]
  to each enemy engaged with the "defending player" (the catalogue had
  "defending character").
- The source recipe of each Nightmare scenario (`public/scenarios.json`,
  N01.1 for Passage Through Mirkwood, N01.2 for Journey Along the Anduin) is
  the standard encounter deck without the printed removals plus the
  Nightmare Deck: a test compares the two.

## The framework

- `src/game/nightmare.ts` holds the supported Nightmare Decks (setup card and
  printed removals by title), builds the Nightmare encounter deck from the
  standard one, and gives the quest inspector its Nightmare card and lines.
- A game in Nightmare mode keeps `nightmareMode` (never with easy mode); the
  scenario's own setup then runs on the Nightmare encounter deck, and the
  setup card's setup rule follows.
- `src/game/nightmare-core.ts` scripts the setup cards' rules and the
  Nightmare encounter cards as a layer composed with the scenario's hooks
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

## Verification

```sh
node --import tsx --test tests/nightmare-core.test.ts tests/nightmare-anduin.test.ts
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
seeded games of both supported scenarios, played to their end with a valid
save after each action (`tests/nightmare-fixtures.ts`).

The browser suite starts Passage Through Mirkwood in Nightmare mode from the
lobby (easy mode turned off), checks the setup's staging area and reveal, the
Nightmare card in the quest inspector and its rules side, and attaches The
Spider's Web through its choice; it then starts Journey Along the Anduin in
Nightmare mode from the lobby, checks its Nightmare card, and triggers
Gladden Marshlands' Action from the staging area through its choice, at 1280,
390 and 320 pixels (18 checkpoints); it checks the 20 pinned faces.
