# The Black Gate Opens

The second scenario of **The Lord of the Rings: The Mountain of Fire**
(August 2017). It is playable in classic solo and with one to four local
players, in normal and easy mode. Frodo is not used: the first player takes
control of the box's Fellowship-sphere Aragorn (146002), and the scenario has
the **Dire** keyword. The players cannot win; their result is the number of
resources on The Black Gate when they fall. In The Lord of the Rings campaign
([SAGA-CAMPAIGN.md](SAGA-CAMPAIGN.md)) that defeat completes the chapter: its
campaign card records the resource tokens on The Black Gate for Mount Doom,
removes each slain Wraith on Wings from the Campaign Pool and earns Gwaihir
for a first player who controls him. Its epic multiplayer mode with Mount Doom,
for two teams, is described in [MOUNTAIN-FIRE-EPIC.md](MOUNTAIN-FIRE-EPIC.md).

## Sources and corrections

- Recipes Q0B.17 and E0B.17 match the scans' set numbers. Each physical copy
  carries its own number, so a scan shows one copy of a design. The Black Gate
  Opens set runs from The Black Gate (1/40) through Towers of the Teeth (2–3),
  Beleaguered Hills (4–5), Waste of Dagorlad (6–8), Slopes of Cirith Gorgor
  (9–10), Reeking Moat (11–12) and Wall of Morannon (13–14) to The Mouth of
  Sauron (16), Nazgûl of Mordor (17–19), Gorgoroth Hill-troll (20–21),
  Easterling Bowman (22–24), Warrior of Rhûn (25–27), Hell-hawk (28–29), The
  Hour of Doom (30–32), Jaws of Steel (33–34), Rage Filled Him (35–37) and
  Onslaught of Mordor (38–40); number 15 is in no recipe (the campaign card is
  unnumbered). The Orcs of Mordor set (Orc of Mordor 1–3, Snaga Archer 4–6,
  Uruk Soldier 7–9) is shared with The Tower of Cirith Ungol and defined once,
  in `src/game/mordor-orcs-codes.ts`. Easy mode removes the gold-icon copies:
  a Towers of the Teeth, a Slopes of Cirith Gorgor, a Wall of Morannon, a
  Nazgûl of Mordor, a Gorgoroth Hill-troll, a Hell-hawk, a Jaws of Steel, an
  Onslaught of Mordor and an Orc of Mordor (46 cards in the normal encounter
  deck, 37 in easy). The quantities are recorded in
  `tests/black-gate-source-quantities.json`. The scenario has difficulty 7.
- The immutable snapshot `src/data/pending/the-black-gate-opens-import.json`
  has SHA-256
  `f0eeca0ea1a5e4dcc30c6ef4360c826f93357c9d01d738a1d89bba688d6557b5`.
- `tests/black-gate-art.json` pins all **26 faces**, checked by eye (Aragorn
  and Gwaihir from RingsDB, the others from DragnCards). They correct 2A's
  title ("The Battle of the Morannon"), its "Dire." and "adds it to the
  staging area", 2B's missing quest points, The Mouth of Sauron's defense (5,
  not 4), Rage Filled Him's Peril keyword (not a trait), the name Warrior of
  Rhûn, Waste of Dagorlad's "printed text box", Jaws of Steel's "Each player
  assigns", The Black Gate's missing quest points and Towers of the Teeth's
  printed threat X.

## The quest

| Stage                             | Quest points | Rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Embassy from The Dark Tower | 0            | Setup: The Black Gate and The Mouth of Sauron join the staging area; Gwaihir is set aside. Dire. When Revealed: in player order, each player places the top card of his deck faceup until there are 4 player cards; the top 4 encounter cards are placed faceup; starting with the highest cost player card, each takes the highest threat encounter card remaining. For each pair, the first player discards both cards, or reveals the encounter card to play the player card at no cost. Then 2A is revealed. |
| 2A/2B The Battle of the Morannon  | —            | Dire. When Revealed: each player searches the encounter deck and discard pile for a different Orc, Troll or Nazgûl enemy and adds it to the staging area; Gwaihir is shuffled into the encounter deck. During the staging step the first player reveals 1 encounter card for each resource on The Black Gate instead of the normal reveals. Forced: after the players quest unsuccessfully, the active location is discarded. The stage cannot be defeated.                                                      |

**Dire** (The Mountain of Fire rules): while the main quest has Dire, the
threat elimination level is 99, each player's threat cannot be reduced by more
than 1 each round by non-boon player card effects, and Valour triggers at 80
threat instead of 40.

**The result**: the game ends only with the players' defeat. Its reason names
the score: "The players held the Morannon for N rounds: N resources on The
Black Gate."

## Encounter cards

| Card                    | Behaviour                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The Black Gate          | Unique, immune, no quest points; the players cannot travel there. +1 threat for each resource. Forced: at the beginning of the quest phase, 1 resource here and each player raises his threat by 1.                                        |
| Towers of the Teeth     | Immune. Threat X: the characters of the player with the most. While active, the players cannot play allies.                                                                                                                                |
| Beleaguered Hills       | While active, the total threat in the staging area is reduced by the engaged enemies' threat. After it becomes the active location, each player engages a non-unique enemy in the staging area.                                            |
| Waste of Dagorlad       | While active, each ally's printed text box is blank (Traits kept).                                                                                                                                                                         |
| Slopes of Cirith Gorgor | When it leaves play, the first player shuffles the encounter discard pile into the deck, discards until an enemy and puts it into play engaged with him.                                                                                   |
| Reeking Moat            | After it becomes the active location, a non-unique, non-Nazgûl enemy in the staging area goes facedown under it; when the Moat leaves play, each enemy under it engages the first player.                                                  |
| Wall of Morannon        | While active, each enemy and location in the staging area is immune to player card effects. After it becomes the active location, each engaged enemy returns to the staging area.                                                          |
| The Mouth of Sauron     | Unique, immune, engagement 99; he cannot leave the staging area or engage. After a player cancels a 'when revealed' effect, he makes an immediate attack against that player.                                                              |
| Nazgûl of Mordor        | No non-Morgul attachments. After it attacks, the defending player raises his threat by 4 or returns it to the staging area.                                                                                                                |
| Gorgoroth Hill-troll    | No attachments. After its attack destroys a character, the defending player discards a random card from his hand and raises his threat by its printed cost.                                                                                |
| Easterling Bowman       | Peril, Archery 1. When Revealed: 1 damage to a questing character you control. Shadow: after this attack, the attacker engages the next player and attacks him.                                                                            |
| Warrior of Rhûn         | Peril. When Revealed: a questing character you control leaves the quest. Shadow: the defending character cannot ready until the end of the round.                                                                                          |
| Hell-hawk               | Peril. Search the encounter deck, discard pile and victory display for a Nazgûl enemy for the staging area, or attach to a Nazgûl enemy: +2 threat, +2 attack, +2 defense and immunity.                                                    |
| The Hour of Doom        | Doomed 1. Each player raises his threat by 1 for each character he controls, or discards his highest cost ally. Shadow: discard a non-objective attachment you control.                                                                    |
| Jaws of Steel           | Each player assigns X damage among his characters (X: resources on The Black Gate). Shadow: +1 attack for each resource on The Black Gate.                                                                                                 |
| Rage Filled Him         | Peril. The Mouth of Sauron makes an immediate attack against you; if it destroys a character, raise your threat by 4. Shadow: +1 attack (+3 for The Mouth of Sauron).                                                                      |
| Onslaught of Mordor     | Each player deals 1 damage to a questing character he controls; until the end of the phase each damaged character gets -1 willpower and cannot be healed. Shadow: engage a non-unique enemy in the staging area and deal it a shadow card. |
| Orcs of Mordor          | Orc of Mordor, Snaga Archer and Uruk Soldier, as in The Tower of Cirith Ungol.                                                                                                                                                             |

**Gwaihir** (146041, objective-ally, boon, 3/3/3/5, Ranged, Sentinel): When
Revealed: the first player takes control of him, or spends 1 Fellowship
resource and discards him to discard a non-unique enemy in the staging area.
Shadow: the attack deals no damage. An objective-ally that leaves play goes to
the encounter discard pile.

**Aragorn** (146002, Fellowship hero, 0 threat, 2/3/2/5, Sentinel): the first
player gains control of him. Action: spend 1 resource from his pool to ready
him (once per phase). If he leaves play, the players lose. He is scripted in
`src/game/mountain-fire-player-cards.ts` with Frodo and the box's other player
cards to come.

Interpretations:

- **Aragorn follows the first player token** as the Saga's Fellowship hero;
  if the player who controls him is eliminated, he leaves play and the players
  lose.
- **The embassy**: a player with an empty deck places no card; ties in cost or
  threat keep the order the cards were placed in. The reveal is offered only
  when the player card can be played now (by its owner, with a target if it
  needs one); otherwise only the discard remains. The revealed card is
  resolved first, then the player card is played at no cost if it still can
  be. Paired cards go to their owners' discard piles and the encounter discard
  pile.
- **2B's reveals** replace every player's normal reveal: the first player
  reveals one card for each resource on The Black Gate (none while it has no
  resource). The Forced discard ignores immunity (it is the quest's effect)
  and happens once each round.
- **Towers of the Teeth** out of play has threat 0.
- **The Mouth of Sauron** attacks the player who canceled the effect, even
  when the canceled card was revealed by another player.
- **Onslaught of Mordor**'s "each damaged character" is every damaged
  character in play, not only the ones it damaged.
- **Gwaihir** canceled when revealed stays in the staging area as an
  objective-ally nobody controls. The Fellowship resource is paid by a hero of
  the first player with a Fellowship resource icon (Aragorn).
- **Archery** from the staging area (Snaga Archer, Easterling Bowman) is
  assigned at the beginning of the combat phase.

## Engine

- `src/game/dire.ts` holds the Dire keyword: the elimination level, the
  Valour threshold used by every Valour card, and the round key of the threat
  reduction limit. A `threatReduction` hook receives the reduction's source so
  that boon cards stay unlimited.
- New scenario hooks: `lossReason` (the final score in the loss reason),
  `stagingRevealsByFirstPlayer` (2B's reveals), `setupPlays` (the embassy's
  plays before the first round) and the `source` of `threatReduction`.
- The Orcs of Mordor rules moved to `src/game/mordor-orcs.ts`, shared with The
  Tower of Cirith Ungol.
- A game that ends during a rules check now keeps the card text of the final
  board (a location that blanked allies may just have left play), exactly as
  its restored save does.

## Verification

```sh
npm run test:engine
npm run test:black-gate-simulation
npm run build
npm run test:browser-black-gate
npm run audit:rules
```

The focused suite (`tests/black-gate.test.ts`, 14 tests) covers setup in one
to four players and both difficulties with Dire's elimination level and the
embassy's pairs, the embassy's discard and free play, 2A's searches and
Gwaihir, The Black Gate's resources and threat, 2B's reveals and its Forced
discard (Towers of the Teeth included), Dire's threat reduction limit and
Valour at 80, Aragorn's control, Action and loss, every location, The Mouth of
Sauron's immunity and attack against a canceller, every enemy, Gwaihir's
choice and shadow, every treachery and shadow with the Orcs of Mordor, and the
public state. The source test pins the snapshot, the quantities and set
numbers, the corrections and all 26 faces.

The complete-game matrix plays fourteen games from setup (one to four
players, and hidden, decisions and all review modes, in both difficulties)
with exact save restoration after every action, physical conservation (the
embassy's cards, the set-aside Gwaihir, the treacheries being resolved and the
enemies under Reeking Moat) and private-view checks. Every game resolves the
embassy, reaches The Battle of the Morannon and ends in the players' defeat
with their score.

The browser suite runs eight native setups with exact physical inventories
and shows the printed quest cards (both sides), the embassy's pairs and a
revealed pair, 2A's search, The Black Gate's resource, the failed quest, Dire's
threat, Aragorn's Action, Beleaguered Hills, Reeking Moat, Waste of Dagorlad,
Wall of Morannon, The Mouth of Sauron's attack after a cancel, Nazgûl of
Mordor, Easterling Bowman, Warrior of Rhûn, every treachery, Gwaihir's choice
and Gwaihir as an ally, and the final score at 1280/390/320px; it checks all
26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
