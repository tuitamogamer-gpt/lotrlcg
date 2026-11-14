# Mount Doom

The third and last scenario of **The Lord of the Rings: The Mountain of Fire**
(August 2017), and the end of The Lord of the Rings Saga. It is playable in
classic solo and with one to four local players, in normal and easy mode, with
the box's Fellowship-sphere Frodo Baggins (146001) as the Ring-bearer and the
box's The One Ring. Every stage has the **Dire** keyword, and the box's
**Fortitude tests** decide the game. Campaign mode (its campaign card, boons
and burdens, and the resources carried over from The Black Gate Opens) is not
part of this import.

## Sources and corrections

- Recipes Q0B.18 and E0B.18 match the scans' set numbers. Each physical copy
  carries its own number, so a scan shows one copy of a design. The Mount Doom
  set runs from The Tower of Barad-dûr (1/36) and Mount Doom (2) through
  Orc-hold (3–5), Mordor Road (6–7), Plain of Gorgoroth (8–11), Brake of
  Thorns (12–14), Old Water-course (15), Gollum (16), Ringwraith of Sauron
  (17–18), Orc Captain (19–20), Big Uruk (21–23), Little Snuffler (24–27),
  "Wicked Master!" (28), The Lidless Eye (29–32) and Foul Fumes (33–34) to
  Heavy and Tired (35–36). The Deep Shadows set (Drawn to the Ring 1–3, Deep
  Shadows 4–5, Evil Vigilance 6–8) is shared with The Tower of Cirith Ungol and
  defined once, in `src/game/deep-shadows-codes.ts`.
- The recipes put Mount Doom, The Tower of Barad-dûr and one copy of each
  location in the staging area and a fourth Brake of Thorns copy in the active
  location: the locations stand for the players' searches. Their totals match
  the set numbers, so setup makes one Brake of Thorns active and shuffles every
  other location into the encounter deck before the searches. Easy mode removes
  the gold-icon copies: an Orc-hold, a Mordor Road, a Brake of Thorns, a
  Ringwraith of Sauron, an Orc Captain, two Little Snuffler, "Wicked Master!",
  a copy of The Lidless Eye, a Foul Fumes, a Heavy and Tired, a Drawn to the Ring and a
  Deep Shadows (44 physical cards in normal mode, 31 in easy). The quantities
  are recorded in `tests/mount-doom-source-quantities.json`. The scenario has
  difficulty 8.
- The immutable snapshot `src/data/pending/mount-doom-import.json` has SHA-256
  `503d72c1e3f4802938bb0b3ba6fe572dbf9ef570f39e452c7c04e0571bc8bc55`.
- `tests/mount-doom-art.json` pins all **29 faces**, checked by eye (Frodo from
  RingsDB, the others from DragnCards). They correct The Tower of Barad-dûr's
  name, 2B's and 4B's missing quest points and 4B's last sentences ("claims The
  One Ring", "completes the quest"), 2B's "Fortitude test", Brake of Thorns'
  threat (3, not 2), Mount Doom's threat X, Gollum's "\*Forced: After Gollum is
  discarded", Heavy and Tired's "Attach Heavy and Tired", Foul Fumes' "printed
  text box" and The Lidless Eye's Peril keyword (not a trait).
- **Sauron's Eye icons** are printed in the lower left corner of the text box
  and recorded as each card's `sauron_eyes`: Orc-hold, Mordor Road, Brake of
  Thorns, Big Uruk, Little Snuffler and Heavy and Tired have 1; Ringwraith of
  Sauron, Orc Captain, The Lidless Eye and Foul Fumes have 2; "Wicked Master!"
  has 3; the other cards, the Deep Shadows set included, have none. Gollum's
  corner shows the asterisk of his Forced effect. Card text writes the icon as
  `[sauron]`.

## Fortitude tests

From The Mountain of Fire rules: the player may exhaust any number of heroes
he controls to commit them, then discards the top X encounter cards, X being
the tens digit of his threat dial. He passes if the committed heroes' willpower
is greater than the Sauron's Eye icons on the discarded cards, and fails if the
icons are equal or greater. If the encounter deck is empty during the test,
the discard pile is shuffled into it. Once the icons are known an action window
opens, then the test resolves.

The engine runs a Fortitude test as a kind of the Hide test framework of The
Black Riders (commit, discard, action window, result): its summary shows each
discarded card with its icons and the total, and the scenario adds Brake of
Thorns' icon, The Lidless Eye's two icons and Gollum's choice.

## The quest

| Stage                        | Quest points     | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B The Land of Mordor     | 4 + 4 per player | Setup: Mount Doom and The Tower of Barad-dûr join the staging area and Brake of Thorns is the active location (its Forced effect resolves); each player searches the encounter deck for a different location for the staging area. Dire. The first treachery revealed each quest phase is immune to player card effects and gains surge.                                                                                                                                                     |
| 2A/2B The Road to Isenmouthe | —                | Dire. When Revealed: Mordor Road from the encounter deck, discard pile or victory display joins the staging area, the discard pile is shuffled into the deck and the players travel to Mordor Road. Forced: after progress is placed here from a successful quest, each player makes a Fortitude test: a resource here if he passes, the next enemy of the encounter deck engaged with him if he fails. At the end of the quest phase, with a resource for each player, the players advance. |
| 3A/3B The Last Gasp          | 20               | Dire. When Revealed: the discard pile is shuffled into the deck and X locations (X players) from its top join the staging area. The first treachery revealed each quest phase is immune and gains surge. Forced: at the beginning of the quest phase the first player makes a Fortitude test; if he fails, no more than 5 progress can be placed here this round. The stage cannot be defeated unless Mount Doom is the active location.                                                     |
| 4A/4B The Crack of Doom      | —                | Dire. When Revealed: the discard pile is shuffled into the deck and X enemies (X players) from its top join the staging area. Allies cannot enter play and 'when revealed' effects cannot be canceled. Forced: when Mount Doom is explored, the first player makes a Fortitude test with 1 extra card for each player: the players win if he passes and lose if he fails.                                                                                                                    |

**The Tower of Barad-dûr** (objective): players do not raise their threat at
the end of the refresh phase; at the end of the round each player raises his
threat by 1 for each non-Fellowship character he controls.

## Encounter cards

| Card                 | Behaviour                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount Doom           | Unique, immune, Victory 9. Threat X: the tens digit of the first player's threat dial. No travel unless there is at least 20 progress on 3B. Travel: each player makes a Fortitude test; a failure raises that player's threat by 9.              |
| Orc-hold             | While in the staging area, no progress on the other locations there. After it becomes the active location, the discard pile is shuffled in and the next Orc enemy engages the first player.                                                       |
| Mordor Road          | +1 threat for each ally of the player with the most allies. After it becomes the active location, each player discards the top encounter card; enemies join the staging area.                                                                     |
| Plain of Gorgoroth   | +2 threat if a player failed a Fortitude test this round. Travel: the first player makes a Fortitude test; a failure raises each player's threat by 4.                                                                                            |
| Brake of Thorns      | While in the staging area, each Fortitude test has 1 more icon. After it becomes the active location, each player assigns X damage among his characters (X: the tens digit of his threat).                                                        |
| Old Water-course     | Victory 2. Travel: each player exhausts a hero he controls. While active, it gains: Response: when it is explored, each player reduces his threat by 5.                                                                                           |
| Gollum               | Unique, Surge, immune to non-Fellowship player card effects; he engages the first player. After he is discarded during a Fortitude test, he enters play engaged with the first player and the icons of a card discarded for the test are ignored. |
| Ringwraith of Sauron | No non-Morgul attachments. While in the staging area: after a player fails a Fortitude test, it engages that player and makes an immediate attack.                                                                                                |
| Orc Captain          | After it engages you, a Fortitude test; a failure reveals the top encounter card. Shadow: if this attack destroys a character, the attacker returns to the staging area.                                                                          |
| Big Uruk             | After it engages you, raise your threat by 4 or it makes an immediate attack. Shadow: +1 attack for each ally you control.                                                                                                                        |
| Little Snuffler      | Peril, Surge. When Revealed: raise your threat by 1 for each ally you control, or discard an ally you control. Shadow: exhaust a character you control.                                                                                           |
| "Wicked Master!"     | Gollum makes an immediate attack against the first player; if he is not in play, he comes from the encounter deck or discard pile engaged with the first player. Shadow: Gollum attacks again.                                                    |
| The Lidless Eye      | Peril. A Fortitude test, with 2 more icons while The One Ring is exhausted; a failure raises your threat by 10. Shadow: +1 attack (+2 after a failed test this round).                                                                            |
| Foul Fumes           | Each player makes a Fortitude test; a failure deals 1 damage to each of his characters, whose printed text boxes are blank until the end of the round. Shadow: undefended after a failed test this round.                                         |
| Heavy and Tired      | Attaches to the hero with the most attachments and exhausts him; he cannot commit to Fortitude tests. After his controller fails a test, the hero exhausts and each non-objective attachment on him is discarded.                                 |
| Deep Shadows set     | Drawn to the Ring, Deep Shadows and Evil Vigilance, as in The Tower of Cirith Ungol.                                                                                                                                                              |

Interpretations:

- **Brake of Thorns at setup**: its Forced effect resolves when 1A makes it the
  active location, before the searches (a designer ruling relayed on the FFG
  forum). The searches take different titles, in player order.
- **The first treachery of each quest phase** is marked when it is revealed in
  the quest phase (staging step): it gains surge and no player card can cancel
  its effects; later treacheries of the phase can be canceled.
- **2A's travel** returns a previous active location to the staging area. If
  Mordor Road is not in the deck, discard pile or victory display, the players
  travel to one in the staging area; Mordor Road's Forced effect then resolves.
- **2B** tests only after progress is actually placed on the quest card from a
  successful quest, and counts the resources at the end of the quest phase.
- **3B's cap** counts the progress placed after the failed test. The stage is
  defeated as soon as Mount Doom is the active location with 20 progress on
  the stage, so 4A follows the travel at once and Mount Doom is explored at 4B.
- **Fortitude tests**: equal willpower fails; only heroes commit; with threat
  below 10 no card is discarded. When the deck runs out the discard pile is
  shuffled back in any phase, without the test's own cards. Brake of Thorns adds
  an icon for each copy in the staging area; The Lidless Eye's icons count
  while The One Ring is exhausted when the test resolves. The first player
  chooses the card Gollum ignores; cards with the same icons are one choice.
- **Heavy and Tired**: ties for the most attachments are the first player's
  choice; after a failed test it discards itself with the hero's other
  non-objective attachments, and The One Ring stays.
- **Foul Fumes** blanks the failing player's damaged characters (text box
  except Traits) until the end of the round.
- **Old Water-course's Response** is offered to the first player; it is an
  encounter card effect, so Dire does not limit the reduction.
- **Gollum** engages the first player whenever he enters the staging area.

## Engine

- `hide-test.ts` runs Fortitude tests (`kind: "fortitude"`): heroes only, the
  tens digit of the player's threat, the `sauron_eyes` of the discarded cards,
  `fortitudeCommitBlocked` and `fortitudeDiscarded` scenario hooks, and the
  existing `hideThreatBonus`, `hidePassed` and `hideFailed` hooks. The test
  summary, the turn panel and the phase help name the Fortitude test.
- The Deep Shadows rules moved to `src/game/deep-shadows.ts`, shared with The
  Tower of Cirith Ungol (their effect names are unchanged for saved games), and
  Dire's threat reduction limit to `src/game/dire-rules.ts`, shared with The
  Black Gate Opens.
- The refresh log states the actual threat raise, and a game that has ended
  keeps the card text of its final board in every rules check.

## Verification

```sh
npm run test:engine
npm run test:mount-doom-simulation
npm run build
npm run test:browser-mount-doom
npm run audit:rules
```

The focused suite (`tests/mount-doom.test.ts`, 14 tests) covers setup in one to
four players and both difficulties with Brake of Thorns' damage and the
searches, the Fortitude test (heroes only, the tens digit, more willpower than
icons, Brake of Thorns, the reshuffle, threat under 10), Gollum during a test
and Heavy and Tired, 1B's quest points and its immune first treachery with
surge, 2A's travel to Mordor Road, 2B's tests, resources and advance, 3A, 3B's
cap, the travel to Mount Doom and 4A, 4B's ally ban, cancel ban, win and loss,
The Tower of Barad-dûr, every location, enemy, treachery and shadow, Dire and
the public state with saves in the middle of a test. The source test pins the
snapshot, the quantities and set numbers, the corrections, the Sauron's Eye
icons and all 29 faces.

The complete-game matrix plays fourteen games from setup (one to four players,
and hidden, decisions and all review modes, in both difficulties) with exact
save restoration after every action, physical conservation (the treacheries
being resolved, Heavy and Tired, Gollum and the cards discarded for the tests)
and private-view checks. Three late-game matrices start ten games each at The
Road to Isenmouthe, at The Last Gasp before the travel to Mount Doom and at The
Crack of Doom with Mount Doom active and 8 of its 9 progress; there the first
player keeps heroes ready with more willpower than the last test's cards, and
the games reach that test, won and lost.

The browser suite runs eight native setups with exact physical inventories
and shows the printed quest cards (both sides of all four), Brake of Thorns'
damage and the search at setup, the Fortitude test's commitment and action
window, Gollum's choice, 2A, 2B's resource, 3A, 3B's cap, the travel to Mount
Doom, 4A, the victory and the loss at the Crack of Doom, every location with a
choice, Gollum, Ringwraith of Sauron, Orc Captain, Big Uruk, Little Snuffler,
"Wicked Master!", Foul Fumes and its shadow, and Heavy and Tired at
1280/390/320px; it checks all 29 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
