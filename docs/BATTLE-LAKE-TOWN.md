# The Battle of Lake-town

A standalone scenario that ran as a Gen Con Indy 2012 event and has been
sold as print on demand since October 2012. It was designed by Jonathan
Benton and developed by Caleb Grace. It is playable in classic solo and with
one to four local players. Normal and easy mode use the same 49 cards; easy
mode only adds the usual extra resource. It follows
[The Battle of Five Armies](BATTLE-FIVE-ARMIES.md) in publication order but
uses no Saga rules: there is no Baggins sphere and no Bilbo Baggins.

## Sources and corrections

- Recipe Q99.02 holds 3 quest cards, 36 encounter cards, 9 Smaug cards and
  Lake-town. This matches the 46 encounter cards that
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Battle-of-Lake-town)
  lists for every difficulty. The quantities are recorded in
  `tests/lake-town-source-quantities.json`. The atlas difficulty of 9 rounds
  Hall of Beorn's community rating of 8.9.
- No rules insert exists: print-on-demand packs print their rules on the
  cards. The Smaug deck procedure comes from lead developer Caleb Grace's
  [announcement](https://www.fantasyflightgames.com/en/news/2012/10/16/the-battle-of-lake-town/)
  of 16 October 2012. At the beginning of each quest phase, before the top
  card of the Smaug deck is drawn, the first player decides whether Smaug
  goes to the staging area or enters play engaged with him.
- How damage carries over, the Smaug discard pile, the reshuffle and
  absorbing burn by exhausting characters follow
  [Vision of the Palantir](https://visionofthepalantir.com/2021/06/26/the-battle-of-lake-town/).
  Answers from December 2012 in the
  [FFG forum archive](https://ffg-forum-archive.entropicdreams.com/topic/80112-the-battle-for-laketown-rules)
  agree.
- The immutable snapshot `src/data/pending/the-battle-of-lake-town-import.json`
  has SHA-256
  `aa98b976912386b557475a6dd77e5804f21a30b6b0b2889f3161e81cff17b577`.
- `tests/lake-town-art.json` pins all **27 faces**. They were checked by eye
  and correct the catalog:
  - Great Bridge, Great House and The Master's Manor are unique.
  - Stages 1B and 2B have 14 and 10 quest points.
  - Stage 2B reads "any number of progress tokens … the same amount".
  - Stage 3B's Forced effect and Refresh Action are separate paragraphs.
  - Several typos and missing words are fixed: "amount", "shadow", "cancel",
    "makes", "Then, it makes", "If detached, discard The Old Thrush."
  - The catalog's set name "The Battle of Lake-Town" is spelled "The Battle
    of Lake-town", as printed.

## Lake-town and the Smaug deck

- Setup shuffles the three versions of Smaug (3 copies each) into a separate
  Smaug deck. It adds Lake-town to the staging area and reveals 1 encounter
  card per player. Stage 1B then deals 1 damage to Lake-town per player.
- Lake-town is an objective in the staging area. At 50 damage it has
  completely burned and the players lose.
- At the beginning of each quest phase the first player chooses whether the
  next Smaug goes to the staging area or enters play engaged with him. Then
  the top card of the Smaug deck is revealed. Only one Smaug is in play:
  - the previous Smaug goes to the Smaug discard pile;
  - its damage moves to the new Smaug, up to the stage's limit;
  - the new Smaug's When Revealed effect resolves;
  - an empty Smaug deck is reshuffled from its discard pile.
- Stage 1B and 2B limit Smaug to 6 and 12 damage. At stage 3B he can be
  damaged up to his 20 hit points and defeated.

## Burn

Burn X is a keyword on the Lake-town locations. When an effect resolves all
burn damage, the Burn values of every location in play are added together:

1. In player order, each player may exhaust any number of their characters
   to assign burn damage to them, up to their remaining hit points.
2. Damage not assigned to characters is placed on Lake-town.

West Pier gives each location in play Burn 1, itself included. A blanked
location has no printed Burn.

## Stages and encounter cards

| Stage                          | Quest points | Rules                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Terror from the Mountain | 14           | Setup, as above. Smaug cannot have more than 6 damage. When Revealed: 1 damage to Lake-town per player.                                                                                                                                                                                        |
| 2A/2B Fire and Water           | 10           | Smaug cannot have more than 12 damage. When the players quest successfully, any number of the progress tokens that would be placed on the quest may instead be discarded to remove as much damage from Lake-town.                                                                              |
| 3A/3B The Dragon's Wrath       | –            | Forced: 1 additional encounter card is revealed during the quest phase. Refresh Action: reset the quest deck to stage 2B. The players must defeat Smaug: they win only if the victory display has more victory points than Lake-town has damage; otherwise Lake-town has burned and they lose. |

| Card                  | Behaviour                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Smaug the Magnificent | Immune to player card effects. Excess damage from his attacks goes to Lake-town. When Revealed: move 3 of his damage to Lake-town.                                                                                                         |
| Smaug the Mighty      | Immune. When Revealed: an immediate attack against each player, each with its own shadow card.                                                                                                                                             |
| Smaug the Terrible    | Immune. When Revealed: resolve all burn damage.                                                                                                                                                                                            |
| The Old Thrush        | Guarded objective. Action: exhaust a hero to claim it once it is free of encounters (no threat is raised). Response: after the attached hero exhausts to attack Smaug, discard X cards from hand to give Smaug −X defense for that attack. |
| Catching Fire         | When Revealed: shuffle a Pier from the victory display back into the encounter deck; with none, it gains surge. Shadow: the defender gets −2 defense.                                                                                      |
| Close to the Flame    | When Revealed: 1 damage to each character in play. Shadow: the same, unless any player discards a hero to cancel it.                                                                                                                       |
| Dire Magnificence     | When Revealed: each player discards an ally they control, or Lake-town takes 2 damage for each player who cannot. Shadow: if the attack destroys a character, Smaug engages the next player and attacks them.                              |
| Reckless in His Rage  | When Revealed: until the end of the round, Smaug gets +2 threat, +2 attack and −2 defense, and allies cannot defend against him (copies stack). Shadow: if the attack destroys a character, resolve all burn damage.                       |
| Scorching Blast       | When Revealed: resolve all burn damage. Shadow: the same, unless any player discards a hero to cancel it.                                                                                                                                  |
| Town-Baiting          | Cannot be canceled. Smaug attacks Lake-town: the last player may declare a defender. Undefended damage, and damage in excess of the defender's remaining hit points, goes to Lake-town.                                                    |
| East Pier             | Burn 1. "When Revealed" effects of encounter cards cannot be canceled.                                                                                                                                                                     |
| Esgaroth Wharf        | Burn 1. All locations are immune to player card effects. Shadow: +2 attack, then the enemy makes an additional attack (with a new shadow card).                                                                                            |
| Fisherman's Dock      | Burn 1. Travel: with 1 active location, exhaust a hero to travel here as a second active location. Shadow: add it to the staging area.                                                                                                     |
| Great Bridge          | Unique, Burn 2. When Revealed: each player discards X cards from their deck, X being Lake-town's damage; if none are discarded, it gains surge.                                                                                            |
| Great House           | Unique, Burn 3. When Revealed: resolve all burn damage.                                                                                                                                                                                    |
| Merchant's District   | Burn 1. Travel Action: deal 2 damage per player to Lake-town to add it to the victory display. Shadow: 1 damage to Lake-town, 4 if the attack is undefended.                                                                               |
| North Pier            | Burn 2. Smaug cannot be damaged.                                                                                                                                                                                                           |
| South Pier            | Burn 2. The players cannot travel to other locations.                                                                                                                                                                                      |
| The Master's Manor    | Unique, Burn 3. When Revealed: move all of Smaug's damage to Lake-town. Shadow: if the attack destroys a character, the defending player discards their hand.                                                                              |
| West Pier             | Each location in play gains Burn 1.                                                                                                                                                                                                        |

Interpretations:

- **Great House's own Burn.** Great House's When Revealed does not count its
  own Burn 3. The FAQ ruling on The Impassable Bog says a revealed encounter
  card resolves its "When Revealed" effect before it is placed in the
  staging area.
- **Town-Baiting.** Smaug attacks with a shadow card, as any attack does. If
  the last player declares no defender, the attack's full damage goes to
  Lake-town.
- **Dire Magnificence in solo.** In a solo game there is no next player, so
  its shadow has no effect.
- **The Old Thrush.** Smaug's defense goes back to normal after the attack.
- **Fire and Water.** The conversion happens before progress is placed. Only
  progress beyond what the active locations can take can be converted.
- **The Dragon's Wrath.** Its Refresh Action is optional, like every action.
  Resetting to 2B trims Smaug's damage to 12 at once.
- **Esgaroth Wharf.** Its immunity also stops Thrór's Key from attaching to a
  location.

Engine additions:

- Scenario hooks for a second active location, for claimable objectives and
  for claiming them.
- A shared fix to `defensePenalty`. Five "−X defense" shadow effects had
  raised the defender's defense instead: Muck Adder (Conflict at the
  Carrock), Borders of Bree-land (Intruders in Chetwood), Goblin Axeman
  (Over the Misty Mountains Grim), Wind-whipped Rain (We Must Away) and
  Ravenous Warg (The Battle of Five Armies). The field is now a true
  reduction. Hold Steady! (The Thing in the Depths) and Dwindling Supplies
  (Temple of the Deceived), which stored a negative value, now store a
  positive one.
- The log no longer calls an enemy "defeated" when an effect only discards
  it or removes it from the game, as when one Smaug replaces another.

## Verification

```sh
npm run test:engine
npm run test:lake-town-simulation
npm run build
npm run test:browser-lake-town
npm run audit:rules
```

The focused suite covers:

- setup and the Smaug deck: the first player's choice, carried damage, the
  stage limits and the reshuffle;
- the three Smaugs, burn assignment, Town-Baiting, every treachery,
  location and shadow, and The Old Thrush;
- the stage changes: 2B's conversion, 3B's extra reveal and reset, and
  victory or defeat when Smaug falls;
- Lake-town burning, saves and the scenario panel.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (the Smaug deck and discard pile
included) and private-view checks that also reorder the Smaug deck. The
starter decks lose every game by round 5, but in each difficulty one game
reaches stage 2B, so 3B is covered by the focused and browser suites. The
policy chumps Smaug with allies and lets characters take burn once Lake-town
is in danger.

The browser suite runs eight native setups with exact physical inventories.
It shows the quest cards, the Smaug choice, burn assignment, Merchant's
District's action and The Dragon's Wrath's reset. It ends with victory and
defeat at 3B and with a burned Lake-town. It runs at 1280/390/320px and
checks all 27 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
