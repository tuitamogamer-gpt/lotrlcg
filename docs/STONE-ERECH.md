# The Stone of Erech

A standalone scenario (2013 Fellowship event, print-on-demand recipe Q99.03).
It is playable in classic solo and with one to four local players, in normal
and easy mode. Hall of Beorn lists identical normal and easy quantities, so no
card is marked for easy mode: easy mode only adds the usual extra resource to
each hero.

## Sources and corrections

- The rules insert, as summarised by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-stone-of-erech/rulebook),
  defines the three Night objectives, the Dusk and Midnight keywords, Spectral
  (characters attack a Spectral enemy with their willpower instead of their
  attack; its defense still applies and direct damage still works) and
  Battle (committed characters count their attack instead of their
  willpower).
- Recipe Q99.03 matches the quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Stone-of-Erech):
  45 encounter cards in each mode plus 3 quest cards. Hall of Beorn's
  community rating of 6.5 gives the atlas difficulty of 7.
- The immutable snapshot `src/data/pending/the-stone-of-erech-import.json`
  has SHA-256
  `6c5997cc6ed72d796871f3814fd026309f18f88b9294423f6b0783066b20b944`.
- `tests/stone-erech-art.json` pins all **30 faces**. They were checked by eye
  and correct the catalog:
  - **3B The Shadow Host prints "Midnight. Battle."**, which the catalog
    omits.
  - Shadow Host Captain "gets" +2 [attack] and +2 [defense] at Midnight;
    Murmurs of Dread says "All characters"; The Lord of the Dead ends with
    "(except for Traits.)", as printed.
  - Paragraphs follow the cards and double spaces are removed.

## Stages

| Stage                    | Quest points | Rules                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Disappearance  | 6            | Setup: Tarlang's Neck is the active location; Derufin, The Lord of the Dead, The Stone of Erech, Dusk and Midnight are set aside; Eventide is put into play. When Revealed: 1 encounter card per player is revealed. The players cannot defeat this stage while Tarlang's Neck is in play.                             |
| 2A/2B Terror of the Dead | 8            | When Revealed: The Stone of Erech is added to the staging area with Derufin attached. Forced, at the beginning of each round: each player skips the next planning phase, or heroes collect no resources this round.                                                                                                    |
| 3A/3B The Shadow Host    | 14           | When Revealed: starting with the first player, each player searches the encounter deck and discard pile for an Oathbreaker enemy and reveals it; The Lord of the Dead is added to the staging area; the deck is shuffled. Midnight: Battle. No progress unless the players control Derufin. Defeating this stage wins. |

## The Night

Eventide, Dusk and Midnight are objectives next to the quest; one is in play
at a time and it is the current Night objective. At the end of each round it
gets 1 progress. Eventide and Dusk go to the victory display as soon as they
have 4 progress, and the next one is put into play. Midnight never moves on:
after its progress each round, each player raises their threat by its
progress. The Dusk effects of encounter cards are active while Dusk is in
play, and the Midnight effects while Midnight is. The scenario panel shows the
current Night objective, its progress, Derufin and the round's restrictions.

## Encounter cards

| Card                      | Behaviour                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarlang's Neck            | While active, at the beginning of the encounter phase the players end the encounter phase at once, or the first player engages every enemy in the staging area. Victory 1.                                                         |
| The Stone of Erech        | X threat = twice the number of players. Immune to player card effects. While active, characters with less than 2 willpower cannot ready. Travel: each character with less than 2 willpower is exhausted. Victory 5.                |
| Derufin                   | Objective-ally. After the players travel to The Stone of Erech, the first player gains control of him. −1 willpower at Dusk, −2 at Midnight. If he leaves play, the players lose.                                                  |
| Banks of Morthond         | While active, each location in the staging area gets −1 threat. Shadow: a kill adds 1 progress to the current Night objective.                                                                                                     |
| Blackroot Graves          | When explored, the topmost Undead enemy in the encounter discard pile returns to play engaged with the first player. Shadow: a defender with 0 willpower takes 2 damage.                                                           |
| Shadow of Dwimorberg      | +2 threat at Dusk, +4 at Midnight.                                                                                                                                                                                                 |
| Haunted Valley            | In the staging area, ready heroes lose their sphere resource icons. Planning Action (any player): exhaust a hero you control.                                                                                                      |
| Vale of Shadows           | When Revealed: it becomes the active location; the previous one returns to the staging area. +2 quest points at Dusk, +4 at Midnight.                                                                                              |
| Relic from the Dark Years | Objective. At Midnight, claim it onto a hero you control (no threat cost). When that hero attacks an Oathbreaker, the enemy loses Spectral until the end of the phase.                                                             |
| Whisperer                 | Spectral. +1 threat at Dusk; +2 threat and doomed 2 at Midnight.                                                                                                                                                                   |
| Restless Dead             | Spectral. When Revealed: the topmost Undead enemy in the encounter discard pile returns to the staging area.                                                                                                                       |
| Shadow-man                | Spectral. When Revealed: no events until the end of the round. Shadow: +1 attack (+2 at Dusk, +3 at Midnight).                                                                                                                     |
| Shadow Host Captain       | Spectral. +1 attack and defense at Dusk, +2 at Midnight.                                                                                                                                                                           |
| Regretful Shade           | Spectral. Surge. Shadow: 1 additional shadow card (2 at Dusk, 3 at Midnight), each resolved in this attack.                                                                                                                        |
| The Lord of the Dead      | Spectral. Cannot have attachments. The characters of the player engaged with him have blank text boxes (Traits kept).                                                                                                              |
| The Dead Ride Behind      | 1 damage to each character with less than 2 willpower (3 at Dusk, 4 at Midnight).                                                                                                                                                  |
| Groping Horror            | The first player skips the next travel phase, or each player passes their hand to the player on their left (solo: discards the hand). Surge at Midnight.                                                                           |
| Midnight Throng           | Starting with the first player, each player searches the encounter deck and discard pile for an Undead enemy and reveals it; the deck is shuffled. Cannot be canceled at Midnight. Shadow: +1 attack (+2 at Dusk, +3 at Midnight). |
| Driven by Fear            | Condition on a hero of the first player: willpower 0 and a blank text box.                                                                                                                                                         |
| The Gloaming              | Surge. 1 progress on the current Night objective.                                                                                                                                                                                  |
| Murmurs of Dread          | All characters get −1 willpower until the end of the round. Shadow: at Dusk or Midnight, the attacker makes an additional attack; at Midnight it cannot be canceled.                                                               |

Interpretations:

- **Spectral** changes only the attack strength: willpower bonuses count and
  attack bonuses do not. The Relic's hero must be among the attackers.
- **Night thresholds** are checked as soon as progress is added (The Gloaming,
  Banks of Morthond's shadow). A Night objective put into play at the end of
  the round does not also receive that round's progress.
- **Tarlang's Neck**: ending the encounter phase skips optional engagement and
  the engagement checks; combat follows as usual.
- **Searches** let the searching player choose the card and whether it comes
  from the deck or the discard pile; it is revealed, so its When Revealed
  effects and surge resolve.
- **Groping Horror**: "the player on his left" is the next player in turn
  order. The cards keep their owner.
- **Derufin** is an attachment of The Stone of Erech until the travel, so he is
  not a character in play before that. If he leaves play while his text box is
  blank (his controller engaged with The Lord of the Dead), his losing clause is
  blank too: the game goes on, but The Shadow Host can no longer receive
  progress.
- **Setup reveals** resolve before the first round; a "until the end of the
  round" effect revealed then (Murmurs of Dread) ends when the first round
  begins.

Engine additions:

- Scenario hooks for the attack stat against an enemy (Spectral), the
  beginning of the planning phase, heroes that collect no resources, and
  characters that lose their resource icons (a derived unit flag that payment
  reads); the shadow cancellation hook now receives the shadow card.

## Verification

```sh
npm run test:engine
npm run test:stone-erech-simulation
npm run build
npm run test:browser-stone-erech
npm run audit:rules
```

The focused suite (`tests/stone-erech.test.ts`, 16 tests) covers setup in one
to four players, the Night, every Dusk and Midnight effect, Spectral and the
Relic, Tarlang's Neck, the three stages and the win, Derufin's control and
loss, Haunted Valley, Groping Horror, every encounter card and shadow, saves
and the scenario panel. The source test pins the snapshot, the quantities and
all 30 faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including the Night objectives and
the set-aside cards) and private-view checks. The starter decks lose every
game on stage 1 to the rising threat, while the night falls to Dusk; stages 2
and 3 and the victory are covered by the focused and browser suites.

The browser suite runs eight native setups with exact physical inventories and
shows the quest cards, Tarlang's Neck, the fall of Dusk, The Stone of Erech
with Derufin and his rescue, Terror of the Dead, Haunted Valley's action, the
Shadow Host search, a Midnight battle, the victory and the loss of Derufin at
1280/390/320px; it checks all 30 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
