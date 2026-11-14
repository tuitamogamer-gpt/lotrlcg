# The Lord of the Rings: The Road Darkens player cards

The box has 18 player cards. Frodo Baggins, the Fellowship-sphere
Ring-bearer, is described with the Saga rules of
[The Ring Goes South](RING-SOUTH.md). Galadriel and Elrond were already
scripted with the collector cards, from their Two-Player Limited Edition
Starter reprint (see [the collector scripts](COLLECTOR-PLAYER-SCRIPTS.md)).
The other seven are scripted in `src/game/road-darkens-player-cards.ts`. The
eight boons are campaign-mode cards: they stay pending until the Saga's
campaign mode is imported, like the campaign-only text of the three
scenarios.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The nine scans (the seven new cards, Galadriel and Elrond) were downloaded
  from RingsDB and checked by eye; they are pinned by size and SHA-256 in
  `tests/road-darkens-player-art.json`. Galadriel and Elrond now show these
  local scans instead of loading their images from RingsDB.
- The scans correct the catalog in two places: Flame of Anor prints
  Victory 1, and Elrond's response reads "heal all damage from a hero" (the
  catalog has "on a hero").

## Cards

| Card                   | Behaviour                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gandalf                | His controller plays with the top card of their deck faceup: it is shown in the hand zone, to the other players beside his fellowship and in the public state. Once per phase, that player may play it as if it was in their hand ("Play with Gandalf"); Gandalf then has the printed leadership, lore, tactics and spirit icons and can pay for it. |
| Boromir                | +2 defense while defending against an enemy whose engagement cost is higher than his controller's threat. Response: after he takes any amount of damage, ready him.                                                                                                                                                                                  |
| Bilbo Baggins          | Response: after he enters play (played or put into play), search the deck for a Pipe attachment, add it to the hand and shuffle the deck.                                                                                                                                                                                                            |
| Flame of Anor          | Choose an Istari character you control. Cost: Flame of Anor goes to the victory display (1 victory point) and the top card of the deck is discarded. The character readies and gets +X attack until the end of the phase, X being the discarded card's cost.                                                                                         |
| Gandalf's Staff        | Attach to a character named Gandalf; Restricted. Action: exhaust it to choose a player to draw 1 card, add 1 resource to a hero's resource pool, or discard a shadow card from a non-unique enemy.                                                                                                                                                   |
| Wizard Pipe            | Attach to an Istari character, one per character. Action: exhaust it to put a card from your hand on top of your deck and take the top card of your deck into your hand.                                                                                                                                                                             |
| Fellowship of the Ring | Attach to the Ring-bearer (paid with his Fellowship resources). Each hero in play, every player's, gets +1 willpower. Forced: after any character is destroyed, it is discarded.                                                                                                                                                                     |

Interpretations:

- **"As if it was in your hand."** A card played with Gandalf follows every
  rule of a card played from the hand: its timing, unique title, target,
  planning turn and payment, and card text that refers to playing it from the
  hand (Galadriel's response, for instance). Any hero with the matching icon
  may still pay; Gandalf may pay for leadership, lore, tactics and spirit
  cards, while Fellowship and Baggins cards keep their own payers.
- **Gandalf's limits.** Response events are offered automatically when their
  trigger occurs, from the hand only, so they are not played from the top of
  the deck. Guardian of Rivendell, Houses of Healing and the Harad card
  whose optional cost discards from the deck choose that cost with the card
  in the hand; Gandalf cannot play them from the deck. A blank Gandalf turns
  the top card facedown again; Sacked! stops the deck play but not the
  faceup card.
- **Boromir** is offered his response only while he is exhausted, can be
  readied and survives the damage.
- **Bilbo Baggins** offers each different Pipe attachment in the deck and
  takes it directly when there is only one; with none, the deck is still
  shuffled. The response is offered while the deck has cards and no
  encounter effect prevents searching it.
- **Flame of Anor** can choose an Istari character that is already ready:
  the attack bonus still applies. Its costs are paid even if the event is
  cancelled; X is the printed cost, 0 for an X cost.
- **Gandalf's Staff** offers only players with a card to draw, heroes that
  can gain resources and shadow cards a player card may discard. In this
  engine an enemy is unique only if its card data says so.
- **Wizard Pipe** keeps the exchanged card's name out of the log unless the
  top card is faceup.
- **Fellowship of the Ring** counts the heroes in play; a hero turned into
  an enemy is no longer a character in play. A character that leaves play
  without being destroyed does not discard it.

Engine additions:

- A `PLAY_DECK` action plays the faceup top card with the same play
  routine as the hand, and the play dialog opens for it; the public state
  shows the faceup top card of each Gandalf player's deck.
- Player-card hooks for the willpower of every hero, the payer of a deck
  play, damage taken, character destruction and event costs that return X.
- Shadow of the Past's privacy observer keeps a faceup top card in place
  when it swaps the concealed deck order.

## Verification

```sh
node --import tsx --test tests/road-darkens-player-cards.test.ts tests/road-darkens-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-road-darkens-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`node scripts/test-preview.mjs --port 5178`).

`tests/road-darkens-player-cards.test.ts` (11 tests) covers deck-building
eligibility, the pinned scans and corrected texts, and every card through
the real actions: Gandalf's faceup card in one and two players and its
privacy, his deck play with its payment, phase limit, timing, targets and
refusals, Galadriel played from the deck, Boromir's defense and response,
Bilbo's search, Flame of Anor's cost and bonus, the Staff's three options,
the Wizard Pipe's exchange, and Fellowship of the Ring's willpower and
discard.

`tests/road-darkens-player-games.test.ts` plays four seeded complete games
(A Shadow of the Past and Passage Through Mirkwood, each solo and with two
players) with a 50-card deck. The first player uses Gandalf, Éowyn and
Aragorn; the second Gimli, Legolas and Denethor. A greedy policy plays
Gandalf's top card, every new card and both attachment abilities whenever it
is legal and accepts every response; Boromir defends first. Every action is
followed by an exact save restoration, and A Shadow of the Past also runs its
physical-card and privacy observer. The test checks that every new card is
played and that each response, ability and forced effect happens.

`scripts/browser-road-darkens-players.mjs` uses the real controls at 1280,
390 and 320 px, with no page or console errors: the nine faces as pinned,
Gandalf's faceup card and deck play with its play dialog and phase limit,
the faceup card seen by another player, Boromir's response, Bilbo's search,
Flame of Anor's target and victory display, the Staff's target, resource and
shadow options, the Wizard Pipe's exchange and Fellowship of the Ring
(48 checkpoints).
