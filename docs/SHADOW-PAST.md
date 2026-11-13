# A Shadow of the Past

The first scenario of **The Lord of the Rings: The Black Riders** (2013), the
first box of The Lord of the Rings Saga. It is playable in classic solo and
with one to four local players, in normal and easy mode. Campaign mode, with
its boons and burdens, is not part of this import.

## Sources and corrections

- The Saga rules (the Fellowship sphere, The One Ring and the Ring-bearer,
  staging in player order, Hide X and Peril) follow the rules insert, as
  transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-black-riders/rulebook)
  and quoted by
  [Vision of the Palantir](https://visionofthepalantir.com/2021/06/09/keywords/).
  The scenario notes of
  [Vision of the Palantir](https://visionofthepalantir.com/2018/05/23/a-shadow-of-the-past/)
  agree.
- Designer Caleb Grace's answer, quoted in the
  [FFG forum archive](https://ffg-forum-archive.entropicdreams.com/topic/267088-black-riders-hide-tests-and-the-faq):
  "When a Black Rider is revealed and you fail its Hide 2 test, it is meant
  to engage you and attack."
- Recipes Q0B.01 and E0B.01 match the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/A-Shadow-of-the-Past):
  43 and 31 encounter cards without the campaign cards. They are recorded in
  `tests/shadow-past-source-quantities.json`. The atlas difficulty of 6
  rounds Hall of Beorn's community rating of 6.3.
- The immutable snapshot `src/data/pending/a-shadow-of-the-past-import.json`
  has SHA-256
  `979b92e6fd6ce6163e9670c3f00115da7de1b709ca7adf86b38fa8381c216a5b`.
- `tests/shadow-past-art.json` pins all **26 faces**. They were checked by eye
  and correct the catalog:
  - Hunting for the Ring starts with the **last** player, not the first.
  - Black Steed has the Morgul trait, so it may attach to a Black Rider.
  - Frodo Baggins cancels "the effects" of a card; the catalog said "effect".
  - The printed names are Stock-brook, Hunting for the Ring and Have you
    seen Baggins?.
  - Several typos and missing words are fixed: "from", "must", "Counts as",
    "gains:", "canceled", "active". Escape to Buckland's printed typo
    "encouter" is written "encounter".

## The Lord of the Rings Saga

- **The Ring-bearer.** At setup the first player claims The One Ring and
  attaches it to Frodo Baggins, a Fellowship hero with 0 threat. Frodo does
  not count against the hero limit. Control of the Ring-bearer passes with
  the first player token, with his resources and attachments. Players never
  choose a Fellowship hero, and no other Frodo Baggins may be chosen in these
  scenarios.
- **The One Ring.** If it leaves play, the players lose. It is discarded if
  Frodo leaves play.
- **Frodo Baggins.** Response: spend 1 Fellowship resource and exhaust The One
  Ring to cancel the effects of an encounter card just revealed from the
  encounter deck. The card is shuffled back and another is revealed. This
  cancels every effect of the card, its keywords included, but not a card
  that "cannot be canceled".
- **Staging.** Each player reveals their own encounter card, one at a time in
  player order; the revealing player resolves its effects and its Surge.
  Extra reveals belong to the first player.
- **Peril.** The revealing player resolves the card alone. On one shared
  device this only means that the revealing player makes its decisions.

## Hide tests

When an encounter card with Hide X is revealed, the revealing player makes a
Hide test before resolving the rest of the card:

1. The player may exhaust any number of their ready characters to commit
   them.
2. The top X cards of the encounter deck are discarded and their printed
   threat is totalled. The discarded cards' keywords do not resolve.
3. An action window opens: events and abilities may still raise willpower.
4. The test fails if the total threat is greater than the committed
   willpower. Committed characters stay exhausted.

Hide tests are also made by Hunting for the Ring and by the Travel costs of
Stock Road (Hide 1) and Bucklebury Ferry (Hide 3).

When a player fails a Hide test, each Nazgûl enemy in the staging area
engages that player, including a Black Rider whose reveal caused the test.
Then the Forced effects resolve: each Black Rider engaged with that player
attacks, The Marish shuffles a Nazgûl back from the discard pile, and
Have you seen Baggins? discards its hero.

## Stages and encounter cards

| Stage                         | Quest points | Rules                                                                                                                                                                                                                  |
| ----------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Three is Company        | 1            | Setup: Bucklebury Ferry is set aside, 1 Black Rider is added to the staging area (not revealed: no Hide test) and Bag End is the active location. The players cannot advance unless Bag End is in the victory display. |
| 2A/2B A Shortcut to Mushrooms | 14           | When Revealed: the first player reveals a Black Rider from the encounter deck or discard pile; it cannot be canceled. Each ally of a player making a Hide test adds 1 to the threat total.                             |
| 3A/3B Escape to Buckland      | –            | 3A adds Bucklebury Ferry to the staging area; 3B reveals another Black Rider. Response: after a successful Hide test, place 2 progress per player on a non-unique location in play.                                    |

| Card                   | Behaviour                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Black Rider            | Nazgûl, Hide 2. Cannot have non-Morgul attachments. Forced: after the engaged player fails a Hide test, it makes an immediate attack.                                  |
| Evil Crow              | An engaged player adds 1 to the Hide value of each test they make. Shadow: if the defending player failed a Hide test this round, the attack is considered undefended. |
| Bag End                | Response: after it leaves play, each player draws 1 card per Hobbit hero they control.                                                                                 |
| Woody End              | While active, each Hide X value is 1 lower.                                                                                                                            |
| Stock-brook            | When Revealed: the players travel there at once; the active location returns to the staging area.                                                                      |
| Bamfurlong             | Response: after the players travel there, each player engaged with a Nazgûl enemy may ready a hero.                                                                    |
| Bucklebury Ferry       | Immune to player card effects. No travel while another location is in play. Travel: the first player makes a Hide 3 test. Exploring it wins the game.                  |
| Green Hill Country     | While active, characters committed to Hide tests get +1 willpower. Shadow: +1 attack, +2 if the defending player failed a Hide test this round.                        |
| Stock Road             | While in the staging area, each copy adds 2 to the threat total of every Hide test. Travel: the first player makes a Hide 1 test.                                      |
| The Marish             | Forced after a failed Hide test: shuffle a Nazgûl enemy from the discard pile into the encounter deck. Shadow: as Green Hill Country's.                                |
| Pathless Country       | +4 quest points while in the staging area. Shadow: after the attack, the enemy engages the next player and attacks.                                                    |
| Crawling Towards Him   | Peril, Hide 2. When Revealed: a player who failed a Hide test this phase removes their characters from the quest. Shadow: the attacker returns to the staging area.    |
| Hunting for the Ring   | Doomed 2. Starting with the last player, each player returns an engaged Nazgûl enemy to the staging area or makes a Hide 2 test.                                       |
| Have you seen Baggins? | Peril, Surge. Attaches to a hero (one per hero); after any player fails a Hide test, that hero is discarded.                                                           |
| Piercing Cry           | Peril. Search for a Nazgûl enemy: it goes to the staging area or engages the first player (it is not revealed). Shadow: an additional attack.                          |
| Black Steed            | Surge. A Morgul Mount on a Nazgûl enemy: −10 engagement cost; at the end of the refresh phase, its enemy returns to the staging area.                                  |
| Rode Like a Gale       | Each engaged Nazgûl enemy returns to the staging area; with none, it gains surge. Shadow: the attacker returns to the staging area.                                    |
| Lure of the Ring       | Surge. The first player exhausts The One Ring or raises their threat by 3. Shadow: +1 attack, +2 if The One Ring is exhausted.                                         |

Interpretations:

- **Travel costs.** The players travel to Stock Road and Bucklebury Ferry
  whatever the Hide test's result: making the test is the cost.
- **Forced effects.** After a failed Hide test they resolve in a fixed order,
  the one that favours the players: the Black Riders' attacks first, so a
  hero marked by Have you seen Baggins? can still defend.
- **Have you seen Baggins?** The revealing player chooses any hero in play
  that does not already carry a copy.
- **Pathless Country in solo.** With no next player, its shadow has no
  effect.
- **Bag End.** Its card draw is resolved automatically, since drawing never
  hurts the players here.
- **Canceling When Revealed.** A canceled When Revealed effect leaves the
  Hide X keyword: Crawling Towards Him still calls for its test.

Engine additions:

- The generic Hide test (`src/game/hide-test.ts`), with its action window
  and its own panel, the RESOLVE_HIDE action and scenario hooks for its
  modifiers and results.
- The Saga framework (`src/game/lotr-saga.ts`): the Ring-bearer, The One Ring,
  Frodo's response and staging in player order. The box's other player cards
  are described with [their scripts](BLACK-RIDERS-PLAYER-SCRIPTS.md).
- A shared fix: an enemy destroyed during an immediate attack now discards
  the shadow cards held from its earlier attack, which were lost before.
- Pathless Country, Piercing Cry and Lure of the Ring are shared with
  [A Knife in the Dark](KNIFE-DARK.md) through
  `src/game/black-riders-hunted.ts`, and Black Steed and Rode Like a Gale
  with [Flight to the Ford](FLIGHT-FORD.md) through
  `src/game/black-riders-nazgul.ts`; their effect names are unchanged, so
  older saves still load.

## Verification

```sh
npm run test:engine
npm run test:shadow-past-simulation
npm run build
npm run test:browser-shadow-past
npm run audit:rules
```

The focused suite covers:

- setup, the Ring-bearer, staging in player order and Frodo's response;
- the Hide test and all of its modifiers;
- the stages, Bucklebury Ferry, every encounter card and shadow;
- saves made during a Hide test and the scenario panel.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation and private-view checks. Its
policy keeps the best defender back, lets Frodo cancel Black Riders and never
puts Have you seen Baggins? on the Ring-bearer. The starter decks lose every
game, but in each difficulty some games reach stage 2B, so stage 3 is covered
by the focused and browser suites.

The browser suite runs eight native setups with exact physical inventories.
It shows the quest cards, a Hide test's commitment and action window, a
failed test, Frodo's response, the Hide 3 test to reach Bucklebury Ferry,
the victory and the loss of The One Ring. It runs at 1280/390/320px and
checks all 26 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
