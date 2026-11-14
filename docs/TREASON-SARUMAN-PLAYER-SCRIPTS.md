# The Lord of the Rings: The Treason of Saruman player cards

The box has 20 player cards. Aragorn, the Fellowship-sphere hero the first
player controls in its three scenarios, is described with the Saga rules of
[The Uruk-hai](URUK-HAI.md). Gimli and Legolas were already scripted with
the collector cards (see [the collector scripts](COLLECTOR-PLAYER-SCRIPTS.md))
and Ent Draught with the passive player cards. The other ten are scripted in
`src/game/treason-saruman-player-cards.ts`. The six boons are campaign-mode
cards: they stay pending until the Saga's campaign mode is imported, like the
campaign-only text of the three scenarios.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The thirteen scans (the ten new cards, Gimli, Legolas and Ent Draught) were
  downloaded from RingsDB and checked by eye; they match the catalog's texts
  and statistics, and they are pinned by size and SHA-256 in
  `tests/treason-saruman-player-art.json`. Gimli, Legolas and Ent Draught now
  show these local scans instead of loading their images from RingsDB.

## Cards

| Card              | Behaviour                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Théoden           | Sentinel. The first Rohan ally his controller plays from hand each round costs 1 less (to a minimum of 0); a play from the discard pile or the deck does not count.                                                                  |
| Treebeard         | Cannot have restricted attachments. Action: deal 1 damage to Treebeard (a cost) to give him +1 willpower and +1 attack until the end of the phase, 5 times per phase.                                                                |
| Quickbeam         | Cannot have restricted attachments. Enters play exhausted. Response: after he enters play, deal 1 damage to him to ready him.                                                                                                        |
| Háma              | Combat Action, once per round: ready Háma; he gets +3 defense until the end of the phase, at the end of which he is discarded.                                                                                                       |
| Arod              | Attach to a hero or a character named Legolas. Response: after the attached character participates in an attack that destroys an enemy, exhaust Arod to place 1 progress on any location not immune to player card effects.          |
| Herugrim          | Attach to a Rohan hero; Restricted. It costs 1 less to play on Théoden. Response: after the attached hero is declared as an attacker, exhaust Herugrim to add the hero's willpower to its attack for this attack.                    |
| Entmoot           | Play only if you control an Ent character. Action: search the top 5 cards of your deck for any number of Ent cards, add them to your hand, then shuffle the deck.                                                                    |
| Helm! Helm!       | Play only in the combat phase after the enemy attacks (the attack step). Combat Action: exhaust and discard a ready Rohan ally you control (the cost and the play target) to choose and discard a non-unique enemy engaged with you. |
| The Three Hunters | Play only if you control the Fellowship Aragorn, who pays for it. Quest Action: choose 3 heroes committed to the quest; they ready and get +1 willpower, +1 attack and +1 defense until the end of the round.                        |
| Shadowfax         | Attach to a character named Gandalf, who gains ranged and sentinel. Action: exhaust Shadowfax to ready Gandalf.                                                                                                                      |

Interpretations:

- **Théoden's reduction** is recorded once his controller plays a Rohan ally
  from hand while controlling him; a Rohan ally played earlier in the round,
  before Théoden was in play, does not use it up.
- **Treebeard's cost** may destroy him: with his 5 hit points, the fifth use
  in a phase defeats him unless something raises his hit points (Ent Draught).
- **Quickbeam** enters play exhausted however he enters play, and his
  response is offered only while he is exhausted and can be readied.
- **Háma's Combat Action** can be used while he is ready: the defense bonus
  and the discard still apply.
- **The Three Hunters** chooses as many committed heroes as there are, up to
  3, any player's; with 3 or fewer the choice is made automatically.
- **Helm! Helm!** is offered only while a non-unique enemy is engaged with
  its player; its cost is paid as it is played, before the enemy is chosen.
- **Entmoot** searches only the cards that were among the top 5; once no Ent
  card is left among them, the deck is shuffled.
- **The Three Hunters** is a Fellowship card: in deck building it is flagged
  as playable only in The Treason of Saruman scenarios, where the Fellowship
  Aragorn pays for it.

Engine additions:

- Player-card hooks for a cost reduction that sees the play's origin and
  target, the card played, attackers declared and the end of their attack,
  the end of the phase, and allies entering play; Helm! Helm! is a targeted
  event whose cost is paid as it is played.
- The Road to Isengard's privacy observer keeps Gandalf's faceup top card in
  place when it swaps the concealed deck order, as A Shadow of the Past's does.

## Verification

```sh
node --import tsx --test tests/treason-saruman-player-cards.test.ts tests/treason-saruman-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-treason-saruman-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`node scripts/test-preview.mjs --port 5178`).

`tests/treason-saruman-player-cards.test.ts` (9 tests) covers deck-building
eligibility and warnings, the pinned scans and catalog texts, and every card
through the real actions: Théoden's reduction and Sentinel, Herugrim's
targets and cost, Treebeard's growth, phase limit and restricted
attachments, Quickbeam's entry and response, Háma's Combat Action and
discard, Arod's targets and progress, Herugrim's attack bonus for one attack,
Entmoot's search, Helm! Helm!'s timing, cost and discard, The Three Hunters
and Shadowfax.

`tests/treason-saruman-player-games.test.ts` plays six seeded complete games
(two of Helm's Deep solo, one of The Road to Isengard with two players, one of
Passage Through Mirkwood solo and two with two players) with a 50-card deck. The first player
uses Théoden, Treebeard and Éowyn (and the Fellowship Aragorn in The Treason
of Saruman); the second Gimli, Legolas and the Road Darkens Gandalf. A greedy
policy plays every new card, uses every new ability whenever it is legal and
accepts every response. Every action is followed by an exact save
restoration, and the two Treason of Saruman scenarios also run their
physical-card and privacy observers. The test checks that every new card is
played and that each response, ability and reduction happens.

`scripts/browser-treason-saruman-players.mjs` uses the real controls at 1280,
390 and 320 px, with no page or console errors: the thirteen faces as
pinned, Théoden's free Rohan ally, Treebeard's growth, Quickbeam's response,
Háma's Combat Action, Arod's and Herugrim's responses, Entmoot's search,
Helm! Helm!'s cost and enemy, The Three Hunters and Shadowfax (36
checkpoints).
