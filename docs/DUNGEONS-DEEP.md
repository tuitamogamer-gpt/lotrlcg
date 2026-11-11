# Dungeons Deep and Caverns Dim

The third and last scenario of **The Hobbit: Over Hill and Under Hill** follows
[Over the Misty Mountains Grim](MISTY-MOUNTAINS.md). The shared Saga rules are
described with [We Must Away, Ere Break of Day](WE-MUST-AWAY.md). It is
playable in classic solo and with one to four local players, in normal and easy
mode, and accepts the discovered treasures.

## Sources and corrections

- Riddle rules follow the rules insert, summarised from the
  [RulesPal transcription](https://rulespal.com/the-hobbit-over-hill-and-under-hill/rulebook):
  name the items, shuffle, discard the top X player cards, one progress on
  stage 2 per card featuring every named item; an answered card goes to the
  encounter discard pile.
- Recipe Q0A.3 (39 encounter cards) matches the normal quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Dungeons-Deep-and-Caverns-Dim).
  The source easy recipe E0A.3 lists one Goblins' Caves; Hall of Beorn and the
  same Misty Mountain Goblins set in Over the Misty Mountains Grim have two, so
  the easy deck uses two (30 cards). The atlas difficulty of 6 rounds Hall of
  Beorn's community rating of 6.4.
- The immutable snapshot `src/data/pending/dungeons-deep-and-caverns-dim-import.json`
  has SHA-256
  `813d51fec3efa904a52ee2fe13bb8c2dbb9c33f158cdbd29633692c3c38c223b`.
- `tests/dungeons-deep-art.json` pins all **24 faces**; the 17 new faces were
  visually reviewed and confirm the catalog text. Stage 3A is flavour only.

## Scenario rules

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B Out of the Frying Pan | 14 | Setup adds Lake in the Cavern and creates the riddle area with stage 2. One additional card per player is revealed in each staging step. |
| 2A/2B Riddles in the Dark | 9 | In the riddle area: Gollum, and Bilbo with Bilbo's Magic Ring attached. Only answering riddles changes its progress. The quest advances to stage 3 only when 1B and 2B are both complete. |
| 3A/3B Into the Fire | 16 | Bilbo rejoins the first player, Lake in the Cavern is removed, Gollum engages the first player and one card per player is revealed. Undefended damage from Gollum is placed on Bilbo; riddles are ignored; treacheries gain surge. Defeating it wins. |

**The riddle area:** Gollum adds no threat and cannot be engaged. Bilbo, still
controlled by the first player and collecting resources, cannot quest, attack,
defend except against Gollum, take damage from anything but Gollum or receive
player attachments, and is immune to player card effects.

**Riddles:** when a card with a riddle is revealed from the encounter deck in
stage 1, the first player answers it or resolves the card normally (It Likes
Riddles? and What's In My Pocket? must be answered). Answering names a card
type (ally, event, attachment, treasure), a sphere (leadership, spirit, lore,
tactics, Baggins) or a cost (0–6) as the riddle asks; Bilbo's Magic Ring may
first spend Baggins resources for one more discarded card each. With no match,
Gollum attacks Bilbo without a shadow card; Bilbo may exhaust to defend.

| Card | Behaviour |
| --- | --- |
| It Likes Riddles? | After a match, encounter cards are discarded until another riddle, which is answered too. |
| What's In My Pocket?, Not fair! Not fair! | Cannot be cancelled. Not fair! names an encounter card type and each non-matching card of the top three removes a stage 2 progress (it is the card that removes riddle progress). |
| Come down little bird | Each player puts a Creature from the encounter deck or discard pile into play engaged with them; the deck is shuffled. |
| Hiding in the Trees | Characters get −1 willpower and cannot attack until the end of the round. |
| Wild Wargs | +2 attack while one of its shadow cards has a riddle. |
| Great Gray Wolf | A riddle shadow returns every Creature to the staging area at the end of combat. |
| The Wargs' Glade | Each time a Creature's attack damages a character, 1 progress leaves the quest. |
| Lake in the Cavern | 2X threat (X = players), no travel, immune to player card effects; a Cave for the Goblins. |
| Bilbo's Magic Ring | Exhaust: each player raises threat by 2 and Bilbo gains a Baggins resource. |

The Misty Mountain Goblins keep the rules they have in Over the Misty
Mountains Grim.

Engine additions: scenario hooks for characters that cannot commit and for
additional staging reveals.

## Verification

```sh
npm run test:engine
npm run test:dungeons-deep-simulation
npm run build
npm run test:browser-dungeons-deep
npm run audit:rules
```

The focused suite covers setup and inventory, the riddle area restrictions,
answering and chained riddles, Gollum's attack, every card, both stage
transitions and malformed saves. The complete-game matrix plays fourteen
games with the treasures in the first player's deck, exact save restoration
after every action, physical conservation and private-view checks. The browser
suite answers a riddle and resolves Gollum's attack through the real controls.

The additive account-choice SQL migration is included; it has not been applied
to a hosted database.
