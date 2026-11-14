# The Lord of the Rings: The Flame of the West player cards

The box has 16 player cards. Aragorn, the Fellowship-sphere hero the first
player controls in its three scenarios, is described with the Saga rules of
[The Passing of the Grey Company](GREY-COMPANY.md); Desperate Defense was
already scripted with the collector cards (see
[the collector scripts](COLLECTOR-PLAYER-SCRIPTS.md)), and Esquire of Rohan
and Esquire of Gondor are the boons of
[The Battle of the Pelennor Fields](PELENNOR-FIELDS.md). The other eleven are
scripted in `src/game/flame-west-player-cards.ts`. Army of the Dead, the
campaign's objective-ally, stays pending until the Saga's campaign mode is
imported.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The eleven scans were downloaded from RingsDB and checked by eye; they are
  pinned by size and SHA-256 in `tests/flame-west-player-art.json`. They
  correct Prince Imrahil's "a hero card in your discard pile", Golden Shield's
  "its defense", Roheryn's "declare that hero as an attacker" and Banner of
  Elendil's "committed".

## Cards

| Card                | Behaviour                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Éowyn               | Setup: reduce your threat by 3. Action: raise your threat by 3 to ready Éowyn; she gets +9 attack until the end of the phase (limit once per game for the group).                                 |
| Beregond            | Sentinel. Response: after Beregond defends an attack and takes no damage, reduce the defending player's threat by 1 (limit once per round).                                                       |
| Grimbold            | Combat Action: discard Grimbold to choose an enemy engaged with a player; that enemy cannot attack that player this phase.                                                                        |
| Prince Imrahil      | While there is a hero card in your discard pile, he loses the ally card type and gains the hero card type.                                                                                        |
| Halbarad            | Costs 1 less for each enemy engaged with you. Each enemy engaged with you gets +10 engagement cost.                                                                                               |
| Ghân-buri-Ghân      | Willpower X, the threat of the active location. Travel Action: discard him to travel to a location without resolving its Travel effect.                                                           |
| Sterner than Steel  | Response: exhaust a Weapon or Armor attached to the defending character to cancel a shadow effect just triggered during combat.                                                                   |
| Golden Shield       | Attach to a Rohan hero; Restricted. Response: after the attached hero is declared as a defender, exhaust Golden Shield to add its willpower to its defense for this attack.                       |
| Livery of the Tower | Attach to a Gondor hero; Restricted. Response: spend X resources from the attached hero's pool to cancel X damage just dealt to it.                                                               |
| Roheryn             | Attach to a Dúnedain hero; Aragorn gains the Tactics icon. Response: after you optionally engage an enemy, exhaust Roheryn and the attached hero to declare it as an attacker against that enemy. |
| Banner of Elendil   | Attach to Aragorn. While he is committed to the quest, each other questing character you control gets +1 willpower; while he attacks, each other attacking character you control gets +1 attack.  |

Interpretations:

- **Éowyn's Setup** resolves as the initial threat levels are set, so her
  player's initial threat level (used, for instance, by The Paths of the
  Dead) is the reduced one. Her **Action** can be triggered while she is
  ready, for the +9 attack; "once per game for the group" counts every
  player's copies.
- **Beregond takes no damage** when his damage did not grow during the
  attack, damage canceled by Livery of the Tower included. The **defending
  player** is the player the attack was made against, also when Beregond
  defends it as a sentinel for another player.
- **Grimbold** may choose any enemy engaged with any player; the attack
  prevention is Feint's.
- **Prince Imrahil** moves to the hero row while there is a hero card in his
  owner's discard pile: he collects resources in the resource phase, pays for
  Spirit cards, counts as a hero for hero effects and keeps his fellowship
  from being eliminated when its last hero is destroyed. When no hero card is
  left in the discard pile he is an ally again; resources on him stay.
- **Halbarad's reduction** counts the enemies engaged with the player paying
  for him; his +10 engagement cost applies to the enemies engaged with his
  controller.
- **Ghân-buri-Ghân's X** is the current threat of the active location, 0
  without one. His Travel Action follows the ordinary travel rules (the travel
  phase, an empty active location, the restrictions of each location and the
  immunity of Siege of Gondor's Ships in the staging area) and skips the
  location's Travel cost and every scenario Travel effect; Forced effects
  after the travel still resolve. Temple of the Deceived's map travel does not
  offer it. With several players, his
  controller takes the seat to use it in the travel phase.
- **Sterner than Steel** is offered to a player who controls a ready Weapon or
  Armor attached to a defending character; with several, the player chooses
  which one to exhaust.
- **Golden Shield** adds the hero's willpower as the Response resolves.
- **Livery of the Tower** answers any damage except damage paid as a cost; X
  is chosen from 1 to the lower of the damage and the hero's resources.
- **Roheryn** answers an optional engagement of its controller during the
  encounter phase; the hero's attack resolves at once against that enemy,
  outside the combat phase. Roheryn and the hero must be ready, as both
  exhaust to pay the cost.
- **Banner of Elendil** attaches to any hero named Aragorn; its bonuses go to
  the characters its controller controls. On the Fellowship Aragorn it is an
  Artifact (he gains sentinel and quests without exhausting) paid with his
  Fellowship resources, so the deck builder warns that it can only be played
  in The Flame of the West scenarios.

Engine additions:

- Prince Imrahil's card type follows the owner's discard pile, as Ered
  Thalion's follows the side quests; the hero flag is part of the save.
- A `roheryn` player-attack mode lets an exhausted hero attack as an effect.
- A Livery of the Tower damage window joins the existing cancel windows, with
  its own damage-context flag.
- The combat record keeps each defending Beregond's damage from the
  declaration of defenders.
- The deck builder names The Flame of the West for its Fellowship card.

## Verification

```sh
node --import tsx --test tests/flame-west-player-cards.test.ts tests/flame-west-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-flame-west-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`node scripts/test-preview.mjs --port 5178`).

`tests/flame-west-player-cards.test.ts` (12 tests) covers deck-building
eligibility, the pinned scans and corrected texts, the deck builder's
warning, and every card through the real actions: Éowyn's Setup in a new game
and her group-wide limit, Beregond's sentinel Response, its limit and the
damage that prevents it, Grimbold's Combat Action, Prince Imrahil's hero type,
resources and the fellowship he keeps in the game, Halbarad's cost and
engagement costs, Ghân-buri-Ghân's willpower and travel (without the Travel
effect, and never to an immune Ship), Sterner than Steel's cost and cancel,
Golden Shield's targets and defense, Livery of the Tower's choice and its
interplay with Beregond, Roheryn's Tactics icon, Response and attack (and the
engagement that does not trigger it), and Banner of Elendil's target,
willpower and attack bonuses.

`tests/flame-west-player-games.test.ts` plays six seeded complete games (The
Siege of Gondor solo and with two players, The Battle of the Pelennor Fields
solo and with two players, and Passage Through Mirkwood twice with two
players, four of them in easy mode) with a 52-card deck. The first player uses
Éowyn, Beregond and Théodred (with the Fellowship Aragorn in The Flame of the
West); the second Beravor, Dúnhere and Eleanor. A greedy policy plays every new
card, uses every new ability whenever it is legal and accepts every response.
Every action is followed by an exact save restoration, and the two Flame of
the West scenarios also run their physical-card and privacy observers. The
test checks that every new card is played, that each Setup, Action and
Response happens, that Prince Imrahil becomes a hero and that
Ghân-buri-Ghân's player takes the seat to lead the travel.

`scripts/browser-flame-west-players.mjs` uses the real controls at 1280, 390
and 320 px, with no page or console errors: the eleven faces as pinned,
Éowyn's Action, Beregond's Response, Grimbold's choice, Prince Imrahil in the
hero row, Halbarad's cost, Ghân-buri-Ghân's travel, Sterner than Steel,
Golden Shield, Livery of the Tower, Roheryn's attack and Banner of Elendil
played on Aragorn (42 checkpoints).
