# Nightmare mode

A Nightmare Deck turns a scenario into its Nightmare variant: its setup card
lists the encounter cards it removes from the scenario's standard encounter
deck, its own encounter cards are shuffled into the rest, and the setup card
is flipped next to the quest deck, its rules active for the whole game.
Nightmare mode is offered in the lobby (next to easy mode, which it replaces)
for each scenario whose Nightmare Deck is supported; the scenario archive's
Nightmare list of such a scenario offers it too ("Choose adventure"). It is
not offered in campaign mode.

**Supported so far:** Passage Through Mirkwood (the Core Set Nightmare
Deck's first scenario). The other Nightmare Decks follow in publication
order, beginning with Journey Along the Anduin and Escape from Dol Guldur.

## Sources

- The card texts are the DragnCards data in the imported catalogue
  (`public/catalog.json`), checked by eye against the DragnCards scans; the
  checked cards are written to `src/data/nightmare-encounter-cards.json` and
  their faces pinned in `tests/nightmare-art.json` (Passage Through Mirkwood:
  9 cards, 10 faces).
- The scans correct the catalogue: each setup card's front is the removal
  list ("Begin with the standard quest deck and encounter deck … Remove the
  following cards, in the specified quantities …"), where the catalogue had a
  generic text; Glade of the Spawn begins "While Glade of the Spawn is the
  active location"; The Spider's Web "Counts as a Condition attachment";
  Ungoliant's Spawn's shadow raises "defending player's threat" (the
  catalogue misspelled "theat").
- The source recipe of each Nightmare scenario (`public/scenarios.json`,
  N01.1 for Passage Through Mirkwood) is the standard encounter deck without
  the printed removals plus the Nightmare Deck: a test compares the two.

## The framework

- `src/game/nightmare.ts` holds the supported Nightmare Decks (setup card and
  printed removals by title), builds the Nightmare encounter deck from the
  standard one, and gives the quest inspector its Nightmare card and lines.
- A game in Nightmare mode keeps `nightmareMode` (never with easy mode); the
  scenario's own setup then runs on the Nightmare encounter deck, and the
  setup card's setup rule follows.
- `src/game/nightmare-core.ts` scripts the setup cards' rules and the
  Nightmare encounter cards as a layer composed with the scenario's hooks
  (the composition the Ered Mithrin Campaign Pool uses), so the standard
  encounter cards keep their own scripts. Its lasting effects are saved with
  the game and checked when a save is restored.
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

## Verification

```sh
node --import tsx --test tests/nightmare-core.test.ts
npm run build
npm run test:browser-nightmare
```

`tests/nightmare-core.test.ts` (6 tests) covers the texts, stats and faces;
the Nightmare encounter deck against the source recipe and the printed
removals; the audit's Nightmare recipes; the setup (the reveal for one and two
players, the mode replacing easy mode, refused for an unsupported scenario,
and its save checks); and each card's rules (Abandoned Camp leaving play and
its shadow, Backtrack!'s return, surge and shadow, Glade of the Spawn, Forest
Flies, Spiders of Mirkwood, Ungoliant's Brood, Ungoliant's Spawn and The
Spider's Web in a two-player game).

The browser suite starts Passage Through Mirkwood in Nightmare mode from the
lobby (easy mode turned off), checks the setup's staging area, the Nightmare
card in the quest inspector and its rules side, and attaches The Spider's Web
through its choice, at 1280, 390 and 320 pixels (12 checkpoints); it checks
the 10 pinned faces.
