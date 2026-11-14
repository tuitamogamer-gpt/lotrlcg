# Shelob's Lair

The third scenario of **The Lord of the Rings: The Land of Shadow**
(November 2015). It is playable in classic solo and with one to four local
players, in normal and easy mode, with the box's Fellowship-sphere Frodo
Baggins as the Ring-bearer. Campaign mode, with its campaign card and the A
Heavy Burden burden, is not part of this import.

## Sources and corrections

- Recipes Q0B.12 and E0B.12 match the scans' set numbers: 25 cards of
  Shelob's Lair (Shelob is "1/25") and 10 of The Great Spider (Blocked Tunnel
  is "1/10"), with 3 of Gollum (We Hates Them! and Gollum, whose back is
  Sméagol) and 4 of Morgul Nazgûl, plus the 3 quest cards, Frodo Baggins and
  The One Ring.
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Shelob's-Lair)
  matches every normal quantity; its 44 encounter cards add the burden and
  the campaign card. In easy mode it lists The Great Spider at 1, 1, 2 and 2
  copies (Blocked Tunnel, Shelob's Poison, Lurking Malice, Rage and Hunger)
  where recipe E0B.12 keeps 2, 2, 3 and 3; the import follows the catalog's
  recipe, as for The Passage of the Marshes. The quantities are recorded in
  `tests/shelob-lair-source-quantities.json`. The scenario has no official
  difficulty;
  [Vision of the Palantír](https://visionofthepalantir.com/2023/05/08/shelobs-lair)'s
  community rating of 7.6 gives the atlas difficulty of 8.
- Gollum, Morgul Wraith, Call of the Ring and We Hates Them! are the cards of
  The Passage of the Marshes; their rules now live in
  `src/game/land-shadow-gollum.ts`, shared by both scenarios.
- The immutable snapshot `src/data/pending/shelob-s-lair-import.json` has
  SHA-256
  `273b092bc2187521b88ee9015bdf6312d3d063716878da56ba4ce7228bfb0bda`.
- `tests/shelob-lair-art.json` pins all **29 faces**, checked by eye (Frodo
  Baggins from RingsDB, the others from DragnCards). They correct the
  catalog's names (Orc of Cirith Ungol, Sméagol's Secret Way), Sméagol's
  accent throughout, the Secret Way's Victory 2, stage 1A's closing "Shuffle
  the encounter deck.", stage 3B's "both" and "victory display", The Spider's
  Lair's "immediate" attack, Rage and Hunger's "Shelob makes an immediate
  attack" and Cleft of Cirith Ungol's name in its own text. Paragraphs follow
  the cards and double spaces are removed.

## Stages

| Stage                            | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Stairs of Cirith Ungol | –            | Setup: Cleft of Cirith Ungol, Shelob and The Great Spider are set aside; Sméagol joins the first player; Morgul Vale is the active location and Sméagol's Secret Way is in the staging area. Progress cannot be placed on Underground locations. Response: after the Secret Way is explored, discard 3 random cards from each player's hand to discard each Nazgûl enemy in the staging area. Forced: at the end of the quest phase, with the Secret Way in the victory display, advance. |
| 2A/2B The Spider's Pass          | 16           | When Revealed: Shelob joins the staging area, and The Great Spider and the encounter discard pile are shuffled into the encounter deck. Shelob cannot leave the staging area and Sméagol cannot attack or defend; each player cannot play, or put into play, more than 1 ally each round; no more than 4 progress is placed on the stage each round.                                                                                                                                      |
| 3A/3B Gollum's Betrayal          | 8            | When Revealed: Cleft of Cirith Ungol joins the staging area, Sméagol flips to Gollum, Shelob is healed and each player places 1 resource on her. A defeated Gollum goes to the victory display; while Shelob has a resource, damage dealt to her is canceled and a resource discarded instead. The players win when they defeat the stage with Shelob and Gollum in the victory display.                                                                                                  |

**Shelob** (unique, Indestructible, cannot have attachments, Victory 8) has
+1 threat for each resource on her; at the beginning of each quest phase the
first player either places 1 resource on her or she attacks him. With Cleft
of Cirith Ungol in the victory display she gets +2 attack, loses
Indestructible and engages the first player.

## Encounter cards

| Card                  | Behaviour                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Morgul Orc            | Peril: discard a random card from your hand, or reveal another card. Shadow: if this attack destroys a character, discard a random card from your hand.               |
| Orc of Cirith Ungol   | Peril: each player discards a random card, or it makes an immediate attack against you.                                                                               |
| Morgul Vale           | Explored: a Morgul Wraith from the deck or discard pile joins the staging area, the deck is shuffled, then The One Ring exhausts or each player discards a card.      |
| Sméagol's Secret Way  | Travel: exhaust Sméagol, or each player discards a random card. Explored: each player exhausts a character or discards a random card.                                 |
| Cleft of Cirith Ungol | Travel: 1 resource on Shelob. In the victory display: Shelob +2 attack, not Indestructible, engages the first player.                                                 |
| The Spider's Lair     | Becoming active: Shelob attacks the first player. Explored: 1 resource is removed from Shelob.                                                                        |
| The Under-way         | In the staging area: Orc enemies get -5 engagement cost and a shadow card when they engage. Shadow: 2 additional shadow cards.                                        |
| Deep Dark Passage     | In the staging area: progress placed on staged locations is reduced by 1. Travel: exhaust Sméagol.                                                                    |
| Den of Night          | In the staging area: after a When Revealed effect is canceled, 1 resource on Shelob. Travel: 1 resource on Shelob.                                                    |
| Blocked Tunnel        | When Revealed: it becomes the active location, the previous one returning to the staging area. Action (any player): exhaust a character with a Weapon for 3 progress. |
| Exhalation of Decay   | Each player discards a random card and a non-objective attachment he controls. Shadow: discard a non-objective attachment.                                            |
| Many Openings         | Staged locations get +1 threat this round; with fewer locations than players, another card is revealed. Shadow: +X attack, X the active location's threat.            |
| Shelob's Poison       | Attaches to a hero you control and exhausts it: limit 1 per hero, blank text box except Traits, cannot ready. Shadow: the same if Shelob attacks.                     |
| Lurking Malice        | Peril, Surge: 1 resource on Shelob, or she attacks you. Shadow: against Shelob, 1 resource and +1 attack per resource.                                                |
| Rage and Hunger       | Shelob +2 attack this phase and an immediate attack against each player. Shadow: against Shelob, an additional attack.                                                |

Gollum, Sméagol, Morgul Wraith, Call of the Ring and We Hates Them! follow
[The Passage of the Marshes](PASSAGE-MARSHES.md).

Interpretations:

- **Sméagol** is the Gollum card's back: he waits in the staging area until
  the opening hands are kept, then joins the first player. Physical counts
  and saves track one card.
- **1B has no quest points**: progress on it has no effect, and only its
  Forced effect advances the quest. A location explored outside the quest
  phase still advances at the end of the next one. The Response is offered
  when a Nazgûl enemy is in the staging area and every player has at least 3
  cards in hand, the cost being paid in full.
- **Shelob's resources at 3B** replace each instance of damage dealt to her
  with the loss of 1 resource, whatever its amount. Healing her at 3A and the
  resources each player places follow the stage's text.
- **The Spider's Pass's ally limit** counts each player's allies entering
  play this round, played or put into play; the progress limit counts the
  progress placed on the stage this round.
- **Shelob's Poison from a shadow** attaches the shadow card itself; the
  attached hero's text box is blank (Frodo's Action included) and it cannot
  ready.
- **Den of Night** answers every cancellation of a When Revealed effect,
  player cards and We Hates Them!'s own cancellation included.
- **Blocked Tunnel's Action** is offered to the player whose turn it is, for
  a ready character he controls with a Weapon attachment.
- **Peril** cards are resolved by the revealing player, who makes the
  choice.

## Verification

```sh
npm run test:engine
npm run test:shelob-lair-simulation
npm run build
npm run test:browser-shelob-lair
npm run audit:rules
```

The focused suite (`tests/shelob-lair.test.ts`, 10 tests) covers setup in
one to four players and both difficulties, the three stages and their
transitions, 1B's Underground restriction, Response and Forced advance,
Morgul Vale and Sméagol's Secret Way, The Spider's Pass's restrictions (no
engagement with Shelob, Sméagol out of combat, one ally and four progress
each round), Gollum's Betrayal's resources, Gollum in the victory display,
Cleft of Cirith Ungol and the victory, Shelob's Forced effect, every
location, treachery, enemy and shadow, the scenario panel data and saves.
The Passage of the Marshes' 18 tests still pass on the shared Gollum rules.
The source test pins the snapshot, the quantities, the corrections and all
29 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
set-aside cards, Sméagol and Gollum as one card, the treacheries being
resolved and Shelob's Poison on its hero included) and private-view checks:
Sméagol's Secret Way takes the players to The Spider's Pass, where Shelob
gathers up to six resources, and the starter decks fall within five rounds.
A second matrix starts twelve games at Gollum's Betrayal with its 8
progress, Gollum and Cleft of Cirith Ungol in the victory display and a
wounded Shelob engaging the first player: seven are won by destroying her.
Hidden and decisions review parity is checked in both matrices (26 games,
3,169 actions).

The browser suite runs eight native setups with exact physical inventories
(the set-aside cards and Sméagol as the Gollum card included) and shows the
three printed quest cards (both sides), Sméagol's Secret Way and Morgul
Vale's Forced effects, The Spider's Pass with Shelob's choice, Shelob's
Poison, Lurking Malice, Orc of Cirith Ungol, Blocked Tunnel, Gollum's
Betrayal, the victory and Sméagol's destruction at 1280/390/320px (56
checkpoints); it checks all 29 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
