# We Must Away, Ere Break of Day

The first scenario of **The Hobbit: Over Hill and Under Hill** (2012), the first
Saga expansion, follows The Massing at Osgiliath in publication order. It is
playable in classic solo and with one to four local players, in normal and easy
mode. This import also adds the shared Hobbit Saga rules for the Baggins-sphere
Bilbo Baggins. The box's other player cards are described in
[the Hobbit player scripts](HOBBIT-PLAYER-SCRIPTS.md). The On the Doorstep
Bilbo and Bilbo's Magic Ring are described with
[Flies and Spiders](FLIES-SPIDERS.md).

## Sources and corrections

- The rules insert's Hobbit sections (Bilbo Baggins, the Baggins sphere,
  treasure, the sack deck and Sack X) are summarised from the
  [RulesPal transcription](https://rulespal.com/the-hobbit-over-hill-and-under-hill/rulebook);
  the quest cards carry the scenario's own rules.
- Recipes Q0A.1 (43 encounter cards) and E0A.1 (31) match the normal and easy
  quantities on [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/We-Must-Away-Ere-Break-of-Day),
  recorded in `tests/we-must-away-source-quantities.json`. The atlas difficulty
  of 7 rounds Hall of Beorn's community rating of 6.6.
- The immutable snapshot `src/data/pending/we-must-away-ere-break-of-day-import.json`
  has SHA-256
  `da0418c3cb94f445b17eca811f9fc213844f46e4ed136194c427e3a4fd6cad59`.
- `tests/we-must-away-art.json` pins source URLs, byte lengths and SHA-256 for
  all **33 visually reviewed faces**: 26 encounter cards, both sides of the
  three quest cards and Bilbo Baggins. Troll Key and Troll Purse use their 2014
  printings, whose text the catalog already carries.

The scans confirm the catalog text. Stage 1B and 3A are flavour only; Dawn Take
You All's When Revealed is printed on side 3B.

## Saga rules

| Rule | Behaviour |
| --- | --- |
| Bilbo Baggins | The first player controls the Baggins-sphere Bilbo (threat cost 0) in addition to their heroes. He is not chosen as a hero, is excluded from deck building, and other Bilbo heroes cannot be chosen in Hobbit scenarios. In easy mode he also begins with the extra resource. |
| Control | When the first player token passes in the refresh phase, Bilbo moves to the new first player with his resources, tokens and attachments. A player whose last hero was Bilbo is then eliminated. |
| Baggins resources | Only Bilbo's pool holds them. They pay for Baggins and neutral cards and for the encounter effects that spend them. Bilbo cannot gain resources from player card effects, including transfers and resource-phase bonuses. |
| Leaving play | If Bilbo leaves play, including when his controller is eliminated, the players lose immediately. |
| Sacked characters | A character with a Sack attached cannot ready, attack, defend, commit to the quest or trigger its effects; it still collects resources. The engine shares these restrictions with Conflict at the Carrock's Sacked!, whose collection ban stays its own. |

## Scenario rules

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B An Unexpected Party | 7 | Setup: the seven Sacks form a face-down sack deck; Bert, Tom, William and Troll Cave wait set aside; each player reveals an encounter card. |
| 2A/2B Roast Mutton | 1 | 2A adds the Trolls and Troll Cave to the staging area and shuffles the discard pile into the deck. On 2B progress that would be placed on the quest discards that many encounter cards instead (the active location takes its progress first). The stage advances when no Troll is left in play or the encounter deck is empty. |
| 3A/3B Dawn Take You All | 0 | The Trolls and every Sack are removed from the game. With Troll Cave in the victory display the players discover Sting, Glamdring and Orcrist. The players win. |

**Sack X:** the first player draws X cards from the sack deck and resolves them
in order. Each attaches to the eligible character it names without a Sack
(never Gandalf, nor a character that cannot have attachments such as Beorn);
the first player breaks ties. If it names no eligible target the
first player chooses any eligible character, and if none exists the card is
shuffled back. A Sack that leaves play, or is removed by Troll Camp, is shuffled
into the sack deck. An empty sack deck ignores the effect.

| Card | Behaviour |
| --- | --- |
| Bert, Tom, William | Engaging a player sacks 1 (William 2). At the end of combat each engaged Troll returns to the staging area unless its player raises their threat by 1. Bert: no attachments on Trolls. Tom: one attacker at a time. William: unengaged Trolls cannot take damage. |
| Troll Key, Troll Purse | Added to the staging area when discarded, they attach to a Troll (the first player chooses). Exhausting Bilbo after the Key's Troll takes attack damage claims the Key; spending 1 Baggins resource after the Purse's Troll is destroyed claims the Purse. |
| Troll Cave | Immune to player card effects. Travel requires the Key on Bilbo and 5 Baggins resources (2 with the Purse), paid as a travel cost. Victory 2. |
| Troll Camp | +1 threat per player for each Troll while in the staging area. While in play Bilbo gains an Action, usable while sacked: exhaust him and spend 1 Baggins resource to remove a Sack. |
| Hungry Troll | The first player engages a chosen Troll in the staging area, otherwise surge. Shadow: 4 damage to each sacked character unless 2 Baggins resources are spent. |
| Lots or None at All | Sack 1 with a Troll in the staging area, otherwise doomed 2. Shadow: a Troll attacker sacks 1 unless 1 Baggins resource is spent. |
| More Like a Grocer | Discards every Baggins resource; its shadow does the same. |
| No Campfire | Doomed 1; each player raises threat by 4 or reveals another card. Shadow: +2 threat for the defending player. |
| Roast 'Em or Boil 'Em? | 1 damage to each ally (2 with a Troll in the staging area). Shadow: Troll Camp is searched out to the staging area. |
| Wind-whipped Rain | Discards every attachment that is not an objective or treasure. Shadow: −1 defense. |
| A Nice Pickle | Doomed 1; the top 2× players discards go to the bottom of the deck. Shadow: shuffled into the deck. |
| A Suspicious Crow | Reveals the top card of the discard pile (a discard reveal, not a deck reveal). Shadow: shuffled back after an attack that deals damage. |
| Cave Entrance | In the staging area, X discards (X = players) go under the deck at the end of the round. |
| Dreary Hills, Lone-Lands | Progress makes each player discard a random card / remove a hero resource. Explored, Bilbo may gain a resource. |
| Hobbit-lands | Progress lets the first player draw. Shadow: the top discard returns to the top of the deck. |

Engine additions: scenario hooks for forbidden attacks, printed doomed overrides
and abilities that ignore a Sack; the `discard` reveal origin.

A win with Troll Cave explored records the treasures for that group of heroes;
[Over the Misty Mountains Grim](MISTY-MOUNTAINS.md) describes how they join
later decks. The Western Lands rules are shared with that scenario.

## Verification

```sh
npm run test:engine
npm run test:we-must-away-simulation
npm run build
npm run test:browser-we-must-away
npm run audit:rules
```

The focused suite covers one-to-four-player normal/easy setup and inventory,
Bilbo's control, resources and loss, each stage, Sack targeting, every Troll,
the Key, Purse and Cave, every treachery, location and shadow, and malformed
saves. The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation and private-view checks, and six
review-mode comparisons. The browser suite uses real controls at 1280, 390 and
320 pixels and checks all 33 served image hashes and decodes.

The additive account-choice SQL migration is included; it has not been applied
to a hosted database.
