# The Ruins of Belegost

The 2015 Fellowship event scenario, later sold print-on-demand (Q99.06,
easy E99.06). It is in the atlas as **The Ruins of Belegost**
(`the-ruins-of-belegost`), playable in classic solo and with one to four local
players, in normal and easy mode.

The heroes search the drowned Dwarf city of Belegost for its lost treasure.
Locations with the new **Discover** keyword reveal Hazards and may hide **Loot**
objectives; the Loot the heroes claim decides where the quest deck branches at
stages 2 and 3. Stalking the Ruins gathers resources each round until
Naurlhûg, the dragon of Belegost, comes out, and the players win only by
defeating him at The Beast of Belegost.

## Sources and corrections

- The recipes match
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Ruins-of-Belegost):
  45 encounter cards (39 in easy mode), 7 quest cards and the two scenario
  rules cards. Hall of Beorn's community rating of 8.1 gives an atlas
  difficulty of 8.
- **Easy mode** removes the gold-bordered cards: Old Stone Troll ×2, Flooded
  Hall ×2 and Spawn of Thangorodrim ×2.
- One immutable snapshot: `src/data/pending/the-ruins-of-belegost-import.json`
  (Q99.06 and E99.06, SHA-256
  `84b3fd6570543ec5888e459256826d73594068d12b3f1776794473be2d321844`);
  `tests/ruins-belegost-source-quantities.json` keeps every card's quantity in
  both recipes.
- `tests/ruins-belegost-art.json` pins all **40 faces** (32 cards; the quest
  cards and the first rules card have two faces). Page 1 of the scenario rules
  (easy mode and the set symbol) is not in the source; pages 2-4 hold Discover,
  Loot and Taking Control of Loot.
- **Corrections from the reviewed scans:**
  - Names: Naurlhûg (the catalog writes Naurlhug), Aulë's Children (Aule's),
    and "the first player" on the five Loot objectives (the catalog writes
    "the fist player").
  - Stalking the Ruins places 1 **resource**, not 1 progress token, at the
    beginning of the quest phase.
  - Keys of Belegost adds the resource "to that hero's pool"; Naurlhûg is
    "Immune to player card effects. Cannot take damage." (two sentences); 4A
    shuffles "Sword of Belegost" (no article).
  - Quest backs: 1B and 2D "The players cannot advance", 1B "advance to stage
    2C ... stage 2A", 3B "Otherwise, advance", 3D "The Discover value of the
    active location".
  - Echoes in the Dark's shadow ends with a period; paragraphs follow the
    cards.

## Setup and stages

Setup (1A): Stalking the Ruins and one Abandoned Mine per player are added to
the staging area; the other copies of Abandoned Mine are shuffled into the
encounter deck. Lurker of the Depths, Naurlhûg, Naurlhûg's Lair and Sword of
Belegost are set aside. One of the five Loot objectives (Book of Aulë's
Children, Blue Mountain Gem, Dwarven Torch, Keys of Belegost, Map of Ered
Luin) is selected at random and lies facedown under Stalking the Ruins; the
other four are shuffled into the encounter deck.

| Stage                         | Quest points | Rules                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Ruins of the First Age  | 6            | The players cannot advance without at least 1 Loot objective. At the beginning of the travel phase, with no location in play, the topmost location in the encounter discard pile returns to the staging area. With Keys of Belegost attached to a hero: 2C, otherwise 2A.  |
| 2A/2B Ancient Evils Disturbed | 9            | When Revealed: Lurker of the Depths is added to the staging area. The players cannot advance without 2 Loot objectives and Lurker of the Depths in the victory display. With Book of Aulë's Children: 3C, otherwise 3A.                                                    |
| 2C/2D Deeper into the Past    | 9            | When Revealed: Lurker of the Depths and the discard pile are shuffled into the deck; cards are discarded until a location, which is added to the staging area. Each explored active location places 1 resource here; 2 Loot and 3 resources are needed. Book: 3E, else 3C. |
| 3A/3B The Servants of Morgoth | 6            | When Revealed: the discard pile is shuffled in and 1 encounter card per player is revealed. The first Hazard card revealed each round gains surge; the players must travel, if able. With Dwarven Torch: 4A, otherwise 3C.                                                 |
| 3C/3D The Roots of Ered Luin  | 6            | Same When Revealed. The active location's Discover value is 1 higher; the players must travel, if able. With Map of Ered Luin: 4A, otherwise 3E.                                                                                                                           |
| 3E/3F The Mines of Belegost   | 6            | Same When Revealed. After a Discover that revealed no Hazard, the top encounter card is revealed; the players must travel, if able. With Blue Mountain Gem: 4A, otherwise 3A.                                                                                              |
| 4A/4B The Beast of Belegost   | —            | When Revealed: Naurlhûg and Naurlhûg's Lair are added to the staging area; Sword of Belegost and the discard pile are shuffled into the deck. While the Lair is in the victory display, Naurlhûg can take damage. Defeating Naurlhûg wins.                                 |

Stage 3 forms a loop (3A → 3C → 3E → 3A) until the matching Loot objective is
attached to a hero. 4B has no quest points: the quest ends only with
Naurlhûg's defeat. After Naurlhûg attacks at 4B, if he was dealt a shadow card
with no shadow effect, he engages the next player and makes an immediate
attack without a shadow card.

**Discover X.** When a location with Discover becomes the active location,
the first player looks at the top X cards of the encounter deck (shuffling the
discard pile in when short), attaches one looked-at Loot objective to the
active location as a guarded objective (choosing when there are several),
reveals one looked-at Hazard selected at random and discards the rest.
Abandoned Mine looks at 1 more card per player; Flooded Hall reveals an extra
Hazard for each other player.

**Loot.** A Loot objective revealed from the encounter deck is discarded and
another card is revealed. When the card guarding a Loot objective leaves play
(an explored location, a destroyed enemy), the first player attaches it to a
hero he controls; Loot on an explored active location is claimed before the
quest advances.

**Stalking the Ruins.** At the beginning of each quest phase it gains a
resource; at 3 or more, Naurlhûg is added to (or returns to) the staging
area. Naurlhûg's threat is the number of resources there. When the players
advance to a new stage, its tokens are discarded and Naurlhûg is set aside,
out of play (his damage and shadow cards go away with him).

The scenario panel shows the current side and its rule, the Loot the heroes
control, the resources on Stalking the Ruins, whether a Loot still lies
underneath it, where Naurlhûg is (set aside, in play, defeated) and, at 2D,
the resources on the stage.

## Encounter cards

| Card                  | Behaviour                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naurlhûg              | Immune to player card effects; cannot take damage (until 4B with his Lair in the victory display). X threat. When he attacks, the defending player assigns X damage among his characters. Victory 7. |
| Lurker of the Depths  | Cannot have attachments; cannot be engaged; no more than 4 damage each round. In the staging area it is considered engaged with each player. Victory 5.                                              |
| Orc of Ered Luin      | When Revealed: an immediate attack against each player that controls a Loot (turn order). Shadow: after this attack, the attacker engages the next player and makes an immediate attack.             |
| Old Stone Troll       | Hazard. No player card attachments; -10 engagement cost per Loot attached to a hero; only the engaged player can declare attackers against it.                                                       |
| Blue Mountain Goblin  | Surge while a Loot is attached to a hero. Shadow: if you control a Loot, it enters play engaged with you and is dealt a shadow card.                                                                 |
| Nameless Cave Dweller | Hazard. No player card attachments; X threat, attack and defense, 1 more than the active location's Discover value. Shadow: +1 attack (+2 if you control a Loot).                                    |
| Naurlhûg's Lair       | Discover 5; immune to player card effects. Explored: the Loot under Stalking the Ruins is added faceup and claimed. Travel: 1 resource per player on Stalking the Ruins. Victory 4.                  |
| Abandoned Mine        | Discover 2 (+1 card per player). In the staging area, no progress can be placed on other staged locations.                                                                                           |
| Flooded Hall          | Discover 4. In the staging area, each ally costs 1 more. Discover reveals an extra Hazard for each other player.                                                                                     |
| Darkened Tunnel       | Discover 2. In the staging area: after a 'when revealed' effect is canceled, the top encounter card is discarded and a Hazard resolves its staging. Travel: 1 resource on Stalking the Ruins.        |
| Sunken Treasury       | Discover 3; +1 threat per Loot attached to a hero. Travel: each player discards 1 random card (no travel while a player has none). Shadow: exhaust a character you control.                          |
| Secret Chamber        | Hazard. Discover 3. Response: after the players travel there with no Loot attached, a Loot from the discard pile is attached to it. Travel: each player raises his threat by 2.                      |
| Echoes in the Dark    | Doomed 1. +1 staging threat per character the first player controls until the end of the phase. Shadow: discard a random card from your hand; an event gives the attacker +2 attack.                 |
| Spawn of Thangorodrim | Naurlhûg in play makes an immediate attack against the first player; otherwise 1 resource on Stalking the Ruins (Naurlhûg at 3). Shadow: the attacker makes an additional attack against you.        |
| Concealed Spikes      | Hazard. Each player assigns X damage (1 more than the active Discover value). Shadow: X damage for your attachments, or discard your highest cost attachment to cancel.                              |
| Covered Pit           | Hazard. Each player discards an ally. Shadow: a non-unique attacker guards one of your Loot; if this attack destroys a character, the attacker returns to the staging area.                          |
| Loot objectives       | Book (a player draws 1), Gem (a player's threat -1), Torch (a non-unique enemy -1 attack and -1 defense for the phase), Keys (a hero gains 1 resource), Map (a non-unique location -2 threat).       |
| Sword of Belegost     | Loot. Restricted. The attached hero gets +4 attack. Response: exhaust it to cancel a shadow effect just triggered.                                                                                   |

Interpretations:

- **Assigning damage** (Naurlhûg, Concealed Spikes) is one point at a time to
  a character the player controls.
- **Lurker of the Depths** attacks each player in the combat phase while it
  is in the staging area, and the players may attack it there; its 4-damage
  limit resets each round.
- **Stage 3's "must travel"** applies only when a staged location can be
  traveled to.
- **Covered Pit's shadow**: the defending player chooses which Loot the
  attacker guards; it is claimed again when the attacker leaves play.
- **Blue Mountain Goblin's shadow**: the shadow card itself is the enemy put
  into play.
- **4A** adds Naurlhûg after Stalking the Ruins has discarded its resources
  and set him aside, so his threat is 0 until the next quest phase.

## Verification

```sh
npm run test:engine
npm run test:ruins-belegost-simulation
npm run build
npm run test:browser-ruins-belegost
npm run audit:rules
```

The focused suite (`tests/ruins-belegost.test.ts`, 13 tests) covers setup in
both difficulties for one to four players, Discover and its modifiers, Loot
(revealed, guarded, claimed), every branch and stage requirement, Stalking the
Ruins and Naurlhûg, Lurker of the Depths, every encounter card and shadow, the
Loot actions, Sword of Belegost, saves and the scenario panel. The source test
pins the snapshot, the quantities of both recipes and all 40 faces.

The complete-game matrix (`npm run test:ruins-belegost-simulation`, in two
CI partitions: complete games and late-game starts) plays 40 games (5,627
actions) with exact save restoration after every action, physical
conservation (the set-aside cards, the Loot under Stalking the Ruins, the
cards a Discover looks at and the treacheries being resolved) and private-view
checks, and 16 exact paced/immediate terminal-state comparisons. From setup,
the starter decks lose all 14 games at Ruins of the First Age: Stalking the
Ruins brings Naurlhûg out by the third quest phase, before the decks claim a
Loot. The 6 games started at the end of Deeper into the Past, with the Keys and
the Book claimed, go on to The Mines of Belegost; the 10 started at the end of
The Servants of Morgoth reveal The Beast of Belegost and lose the fight with
Naurlhûg; the 10 started in the last fight at 4B, with Naurlhûg engaged and 6
hit points left and Sword of Belegost on a hero, are won 5 times. At 4B the
policy commits only enough willpower to match the staging area and keeps the
Sword's hero back to attack.

The browser suite runs eight native setups (both difficulties, one to four
players) with exact physical inventories and shows all seven quest cards,
Discover with two Loot and with a Hazard, claiming a Loot, 2D's resources,
Keys of Belegost, Sword of Belegost cancelling a shadow, Orc of Ered Luin,
Lurker of the Depths, the stage 3 loop, Naurlhûg at 4B and his defeat at
1280/390/320px; it checks all 40 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
