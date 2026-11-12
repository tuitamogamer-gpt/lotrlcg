# The Lonely Mountain

The second scenario of **The Hobbit: On the Doorstep** (2013) follows
[Flies and Spiders](FLIES-SPIDERS.md). It is playable in classic solo and with
one to four local players, in normal and easy mode. This import also adds the
five Erebor treasures as player cards. The On the Doorstep Bilbo Baggins and
Bilbo's Magic Ring are described with Flies and Spiders, and the other Saga
rules with [We Must Away, Ere Break of Day](WE-MUST-AWAY.md).
[The Battle of Five Armies](BATTLE-FIVE-ARMIES.md) follows.

## Sources and corrections

- The burgle rules follow the rules insert, summarised from the
  [RulesPal transcription](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-hobbit-on-the-doorstep/rulebook).
- Recipe Q0A.5 (39 encounter cards with the four setup cards) matches the
  normal quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Lonely-Mountain).
  The source easy recipe E0A.5 lists two Weighed Down and two Fighting Among
  Friends. Hall of Beorn and the same Wilderland set in the Flies and Spiders
  easy recipe have one and none, so the easy deck uses those (28 cards).
  The quantities are recorded in `tests/lonely-mountain-source-quantities.json`.
  The atlas difficulty of 7 rounds Hall of Beorn's community rating of 7.3.
- Secret Entrance follows the official FAQ 1.07 errata and the reviewed scan:
  the first player *looks at* the top encounter card. The catalog text says
  "reveal".
- Thrór's Golden Cup prints Victory 3, which the catalog record omits.
- The immutable snapshot `src/data/pending/the-lonely-mountain-import.json` has
  SHA-256
  `0c8b25bc6528418cb7e3b607acbd165bb431c6670b00206457bb2c11db9cc730`.
- `tests/lonely-mountain-art.json` pins all **31 faces**. The 26 new faces were
  checked by eye and confirm the catalog text, apart from the two corrections
  above.

## Burgle attempts

A burgle attempt is made only when a card says so.

1. Discard cards from the top of the encounter deck until a card with a burgle
   effect is discarded. During the quest phase an empty deck is reshuffled from
   the discard pile once; with no burgle card left, the attempt fails.
2. The first player shuffles their deck and reveals the top card. With an
   empty deck the attempt fails. The revealed card stays on top of the deck.
3. The burgle effect asks for cards from the first player's hand that match
   the revealed card's type, sphere or cost (or two of them). Discarding the
   required number succeeds; the first player may also discard nothing, and
   the attempt fails. With more matching cards than needed they choose which.

While The Lonely Mountain is in play, the first player may spend 2 Baggins
resources (from Bilbo) to take the revealed card into hand and reveal the next
card, as often as they can pay.

| Burgle effect | Matching cards |
| --- | --- |
| Great Hall | 3 of the revealed card's type |
| Western Slopes | 2 of its sphere |
| Desolation of Smaug | 2 of its cost |
| Pretending to Sleep | 2 of its type |
| Belching Fire | 1 of its type and cost |
| Croaking Crows | 1 of its sphere and type |
| Known to an Ounce | 1 of its sphere and cost |

## Scenario rules

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B A Warm Welcome | – | Setup stages Smaug the Golden and The Lonely Mountain, stacks the five Erebor treasures facedown under the Mountain in random order, and sets Smaug the Magnificent and A Bare Patch aside. No card is revealed. The quest phase is skipped; at the end of the round the players advance to stage 2. |
| 2A/2B The Burglar's Turn | – | No progress can be placed on the stage. After questing successfully (once the quest's progress is placed), Smaug the Golden gets 1 progress and the first player makes a burgle attempt. Success: they take the top treasure from under the Mountain into hand, then the players may advance to stage 3. Failure: Smaug the Golden attacks the first player. |
| 3A/3B Inside Information | 20 | Smaug the Golden is set aside; Smaug the Magnificent and A Bare Patch enter the staging area. The stage cannot be defeated while Smaug the Magnificent is in play, so progress can exceed 20. When the stage's progress is greater than his remaining hit points he is removed from play. Defeating the stage wins and discovers every treasure burgled from the Mountain. |
| 4A/4B Thieves! Fire! Murder! | 7 | Smaug the Golden's progress is removed and he is set aside; Smaug the Magnificent enters the staging area. After the 7th progress, Smaug the Magnificent's damage is removed and he is set aside, Smaug the Golden returns and the quest deck resets to stage 2B. |

| Card | Behaviour |
| --- | --- |
| The Lonely Mountain | While at least 1 card is stacked under it: immune to player card effects, cannot leave the staging area (it cannot be travelled to) and −2 threat per card. With every treasure burgled it is a 12-threat location (Victory 10). Its burgle action is described above. |
| Smaug the Golden | X threat is the number of non-Burglar characters committed (Bilbo is a Burglar). Indestructible, immune to player card effects, cannot be engaged. After his 6th progress token the players advance to stage 4A at once. |
| Smaug the Magnificent | 6 threat, 8 attack, 8 defense, 20 hit points. Indestructible and immune to player card effects; he cannot leave the staging area except by quest effects and is considered engaged with the first player, so he attacks them each combat phase with a fresh shadow card. Dealt a shadow card with a burgle effect, he makes an additional attack right after. |
| A Bare Patch | Response: after the players quest successfully, the first player may make a burgle attempt; success attaches it to Smaug the Magnificent (−3 defense). |
| Croaking Crows | Surge. Forced: when a location is revealed from the encounter deck, Smaug the Golden gets 1 progress per Croaking Crows in play. |
| Great Hall | While active, Smaug the Golden gets 1 progress at the end of each round. |
| Western Slopes | Response: when explored, the first player draws 2 cards or removes 1 progress from Smaug the Golden. |
| Desolation of Smaug | While active, the first treachery revealed each round gains surge. |
| Secret Entrance | While active, The Lonely Mountain's threat is halved (rounded up). Travel: the first player exhausts a hero they control and names enemy, location or treachery. After the players travel there, the first player looks at the top encounter card; if it is another type, Secret Entrance returns to the staging area and the players cannot travel again this round. |
| Belching Fire | Each Dragon enemy in the staging area makes an immediate attack, without a shadow card, against the player with the most willpower committed to the quest; the first player chooses between tied players. |
| Known to an Ounce | Each player discards 2 random cards from hand. Until the end of the phase each Dragon enemy in play gets +1 threat per discarded event. |
| Pretending to Sleep | Surge. Smaug the Golden gets 1 progress; then Bilbo spends X Baggins resources (X is that progress) or the players advance to stage 4A. Without X resources they must advance. |
| Dragon-Spell | Attaches to the hero with the most resources (first player breaks ties) that has no Dragon-Spell, Bilbo included: −1 willpower per resource in its pool, and it takes 1 damage per resource it spends. |
| Wilderland | Dark Bats, Hidden Path, Weighed Down and Fighting Among Friends share their rules with Flies and Spiders through `src/game/wilderland.ts`. |

Interpretations:

- Advancing to stage 3 requires a successful burgle attempt at stage 2B, as
  part of the same sentence of the Forced effect.
- If stage 2B's own progress token is Smaug the Golden's 6th, the players
  advance to stage 4A at once and the rest of stage 2B's effect is not
  resolved: the stage has left play. Pretending to Sleep then finds no
  progress on Smaug the Golden, so it has no further effect.
- Smaug the Golden's progress, damage on Smaug the Magnificent and A Bare
  Patch are removed whenever they leave play.
- At stages 3 and 4 Smaug the Golden is out of play, so effects that place or
  remove his progress do nothing and Pretending to Sleep needs no payment.
- Discovered treasure: the treasures taken from under the Mountain during the
  game are discovered on victory, even if they later left play.

## Erebor treasures

| Treasure | Behaviour |
| --- | --- |
| The Arkenstone | Attach to a hero. Action: exhaust it and raise your threat by X (1–6) to lower by X the cost of the next ally you play this phase that matches the attached hero's sphere. |
| Mithril Shirt | Attach to Bilbo Baggins: +1 defense and +1 hit point. |
| Thrór's Battle Axe | Attach to a hero; Restricted. +2 attack. Response: after the attached hero attacks and destroys an enemy, deal 1 damage to another enemy engaged with you (not immune to player card effects). |
| Thrór's Hunting Bow | Attach to a hero; Restricted. The hero gains Ranged and gets +2 attack while attacking an enemy engaged with another player. |
| Thrór's Golden Cup | Attach to a hero. Action: add it to the victory display (Victory 3) to draw 3 cards. |

Treasure sets follow the scenario whose icon they bear. The fellowship screen
offers only discovered treasures whose set the scenario's setup lists:

| Scenario | Treasure sets |
| --- | --- |
| Over the Misty Mountains Grim, Dungeons Deep and Caverns Dim, Flies and Spiders | We Must Away (Sting, Orcrist, Glamdring) |
| The Lonely Mountain | We Must Away and Flies and Spiders (Bilbo's Magic Ring) |
| The Battle of Five Armies | We Must Away, Flies and Spiders and The Lonely Mountain (the Erebor treasures) |

The rules insert shows these sets as icons that the available transcription
does not reproduce; each scenario accepts the sets discovered in the earlier
scenarios of the Saga. Winning Flies and Spiders now records Bilbo's Magic
Ring for the hero group, and winning The Lonely Mountain records the burgled
Erebor treasures.

Engine additions: a hook for resources a hero actually spends (Dragon-Spell),
a shared Wilderland module, per-scenario treasure sets, an ally cost reduction
and a ranged-attack bonus for the treasures.

## Verification

```sh
npm run test:engine
npm run test:lonely-mountain-simulation
npm run build
npm run test:browser-lonely-mountain
npm run audit:rules
```

The focused suite covers:

- setup and inventory, the skipped first quest phase and stage 2;
- The Lonely Mountain's threat, immunity and Secret Entrance, and Smaug the
  Golden's X threat;
- burgle attempts: success, failure, the Mountain's action and choosing among
  matching cards;
- stage 4A from the 6th progress and its reset to stage 2B;
- stage 3: Smaug the Magnificent's considered engagement, burgle shadows,
  A Bare Patch, his removal and victory;
- every encounter card and the five Erebor treasures, treasure sets and
  malformed saves.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (treasures under the Mountain
included) and private-view checks.

The browser suite runs eight native setups with exact physical inventories.
It shows the quest cards, a burgle attempt, a burgled treasure, stage 3,
Smaug waking and victory. It runs at 1280/390/320px and checks all 31 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
