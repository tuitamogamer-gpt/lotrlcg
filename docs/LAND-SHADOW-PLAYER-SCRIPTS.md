# The Lord of the Rings: The Land of Shadow player cards

The box has 14 player cards. Frodo Baggins, the Fellowship-sphere hero the
first player controls in its three scenarios, is described with the Saga rules
of [The Passage of the Marshes](PASSAGE-MARSHES.md); Mablung was already
scripted with the collector cards (see
[the collector scripts](COLLECTOR-PLAYER-SCRIPTS.md)). The other eleven are
scripted in `src/game/land-shadow-player-cards.ts`. The Brace of Coneys boon
is a campaign-mode card: it stays pending until the Saga's campaign mode is
imported, like the campaign-only text of the three scenarios.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The twelve scans (the eleven new cards and Frodo Baggins) were downloaded
  from RingsDB and checked by eye; they match the catalog's texts and
  statistics, and they are pinned by size and SHA-256 in
  `tests/land-shadow-player-art.json`. Snowmane's scan prints "Théoden", which
  the catalog spells without its accent; the local text follows the scan.

## Cards

| Card                | Behaviour                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faramir             | Response: after you engage an enemy, ready an ally you control. Limit once per phase.                                                                                                                                                         |
| Damrod              | The first Trap card his controller plays each round costs 1 less (to a minimum of 0). Response: after a Trap card you control is attached to an enemy, draw 1 card.                                                                           |
| Anborn              | Response: after an enemy is added to the staging area, exhaust Anborn to give that enemy +5 engagement cost until the end of the round, then deal 1 damage to it.                                                                             |
| Skinbark            | Cannot have restricted attachments; enters play exhausted. While he attacks an Orc enemy alone, that enemy does not count its defense.                                                                                                        |
| Gamling             | Response: after a Rohan ally you control is discarded from play, exhaust Gamling to return that ally to your hand.                                                                                                                            |
| Staff of Lebethron  | Attach to a Gondor or Hobbit hero; Restricted. Response: after the attached hero exhausts to defend an attack from an enemy with engagement cost higher than your threat, exhaust the Staff to discard a shadow card from that enemy.         |
| Ambush              | Trap. Played into the staging area unattached, it attaches to the next eligible enemy that enters the staging area. Combat Action: the engaged player discards Ambush to declare an attack against the attached enemy.                        |
| Snowmane            | Attach to a Rohan hero; Restricted, unless the attached hero is Théoden. Response: after the attached hero quests successfully, ready it.                                                                                                     |
| Taste it Again!     | Response: after a hero you control defends an attack by an enemy with engagement cost higher than your threat, ready that hero; until the end of the phase it gets +2 attack while attacking that enemy.                                      |
| In the Shadows      | Costs 1 less for each Hobbit or Ranger hero you control. Combat Action: each enemy engaged with you with engagement cost higher than your threat gets -1 attack and -1 defense until the end of the phase.                                    |
| Speak Your Promise! | Action: ready the Ring-bearer (the cost) to choose an enemy engaged with you. If the Ring-bearer's willpower is greater than that enemy's threat, the enemy gets -X attack and -X defense until the end of the phase, X being the difference. |

Interpretations:

- **After you engage an enemy** answers every engagement of Faramir's
  controller, optional or through an engagement check, as for the Black Riders
  Hobbits. Sméagol, who ignores player cards, is never offered.
- **Damrod's reduction** is used up by the first Trap card his controller
  plays each round, while he is in play.
- **Damrod's Response** answers a Trap played onto an enemy and a Trap waiting
  in the staging area (Ambush, Ranger Spikes and the others) that attaches to
  an enemy entering it; with an empty deck nothing is offered.
- **Ambush** waits in the staging area like Ranger Spikes and attaches to an
  enemy that can have attachments as it is added to the staging area,
  returning from engagement included. Its attack follows the ordinary rules:
  the engaged player's ready characters and any other player's Ranged ones,
  with at least one of the engaged player's.
- **Anborn** answers each enemy added to the staging area, revealed, put into
  play there or returned from engagement; the 1 damage follows the +5.
- **Skinbark's** ignored defense applies only while he is the only attacker
  and the enemy has the Orc trait.
- **Gamling** answers a Rohan ally destroyed or discarded from play by its
  controller's choice or by an effect, the destroyed character being placed in
  its owner's discard pile (Éothain's "by a card effect" shows that both
  count).
- **The Staff of Lebethron** answers only a hero that actually exhausted to
  defend; a facedown shadow card is discarded unseen.
- **Taste it Again!** is offered from hand after the attack resolves, for each
  defending hero of its player; its +2 attack applies only while that hero
  attacks that enemy, during the rest of the combat phase.
- **Snowmane loses Restricted** on Théoden for the restricted-attachment limit
  and every count of restricted attachments.
- **Speak Your Promise!** compares the Ring-bearer's willpower after he
  readies, and leaves an enemy immune to player card effects unaffected.

Engine additions:

- Engaged enemies show the actions of their attachments, as the staging area
  already did, so that the engaged player can use Ambush.
- A host-aware count of restricted attachments, used for Snowmane on Théoden.

## Verification

```sh
node --import tsx --test tests/land-shadow-player-cards.test.ts tests/land-shadow-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-land-shadow-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`node scripts/test-preview.mjs --port 5178`).

`tests/land-shadow-player-cards.test.ts` (10 tests) covers deck-building
eligibility, the pinned scans and catalog texts, and every card through the
real actions: Faramir's once-per-phase readying and Sméagol's immunity,
Damrod's Trap reduction and draws (Ambush from the staging area and Forest
Snare played onto an engaged enemy), Ambush's attachment, Combat Action and
attack, Anborn's engagement cost, damage and end of round, Skinbark's entry,
restricted attachments and attack against Orcs, Gamling's return (and the
allies he does not answer), the Staff's targets and shadow discard, Taste it
Again!'s readying and attack bonus, Snowmane's targets, Théoden and
readying, In the Shadows' cost and penalties, and Speak Your Promise!'s cost,
choice and difference.

`tests/land-shadow-player-games.test.ts` plays six seeded complete games (one
of The Passage of the Marshes solo and one with two players, one of Journey to
the Cross-roads with two players, one of Passage Through Mirkwood solo and two
with two players) with a 50-card deck. The first player uses Faramir, Damrod
and Éowyn (with the Fellowship Frodo in The Land of Shadow); the second
Théodred, Legolas and Eleanor. A greedy policy plays every new card, uses
Ambush whenever it is legal and accepts every response. Every action is
followed by an exact save restoration, and the two Land of Shadow scenarios
also run their physical-card and privacy observers. The test checks that
every new card is played and that each response, ability, attack bonus and
reduction happens.

`scripts/browser-land-shadow-players.mjs` uses the real controls at 1280,
390 and 320 px, with no page or console errors: the twelve faces as pinned,
Faramir's response, Damrod's reduction and draw, Ambush in the staging area
and its attack, Anborn's, Gamling's, the Staff's, Taste it Again!'s and
Snowmane's responses, Skinbark's entry, In the Shadows and Speak Your
Promise! (42 checkpoints).
