# The Lord of the Rings: The Black Riders player cards

The box has 21 player cards. Frodo Baggins, the Fellowship-sphere
Ring-bearer, is described with the Saga rules of
[A Shadow of the Past](SHADOW-PAST.md), and Elf-stone was already scripted
with the collector cards. The other fourteen are scripted in
`src/game/black-riders-player-cards.ts`. The five boons (Mr. Underhill,
Tireless Ranger, Skilled Healer, Valiant Warrior and Noble Hero) are
campaign-mode cards: they stay pending until the Saga's campaign mode is
imported, like the campaign-only text of the three scenarios.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The fourteen scans were downloaded from RingsDB and checked by eye; they are
  pinned by size and SHA-256 in `tests/black-riders-player-art.json`.
- The scans correct the catalog text:
  - Sam Gamgee: "+1 [willpower], +1 [attack], and +1 [defense]".
  - Merry: "Hobbit" in bold italics, as on the other cards.
  - Bill the Pony: the cost reduction comes first, then "Cannot have
    attachments.".
  - Take No Notice: "Lower the cost to play".
  - Hobbit Cloak: "an attack made by an enemy".
  - Dagger of Westernesse: "Attach to a hero. Restricted.".
  - Hobbit Pipe: "Attach to a Hobbit.".
  - Pippin's card prints "with a engagement cost"; the catalog's "an" is
    kept.
- [FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf)
  gives the rulings used below: engaging an enemy and being engaged by it are
  the same (1.49), and an enemy put into play engaged with a player has
  engaged that player; Pippin's passive ignores enemies immune to player card
  effects but his response still works (1.47); Sam's readying and his bonus
  are separate effects, so the bonus applies every time even when he is
  already ready; lasting effects of player cards are fixed when they resolve
  (1.55); "Cannot have attachments" is absolute (1.56).

## Cards

| Card                   | Behaviour                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sam Gamgee             | Response, after his player engages an enemy with an engagement cost higher than that player's threat (including an enemy that engages the player or enters play engaged with them): ready Sam; he gets +1 willpower, attack and defense until the end of the round. |
| Merry                  | +1 attack for each Hobbit hero his controller controls, Merry included. Response: after an attack Merry joins destroys an enemy, ready another character that took part in the attack.                                                                              |
| Pippin                 | Each enemy in play gets +1 engagement cost for each Hobbit hero Pippin's controller controls. Response: after his player engages an enemy with a higher engagement cost than that player's threat, draw a card.                                                     |
| Fatty Bolger           | Action, once per round: exhaust him and choose an enemy in the staging area; his controller raises their threat by its threat and it does not contribute its threat until the end of the phase.                                                                     |
| Bill the Pony          | Costs 2 less while his player controls a Sam Gamgee (hero or ally). Cannot have attachments. Each Hobbit character in play gets +1 hit point.                                                                                                                       |
| Barliman Butterbur     | While each hero of his player is a Hobbit, undefended damage from an attack against that player may be assigned to him.                                                                                                                                             |
| Farmer Maggot          | Response, after he enters play (played or put into play): deal 1 damage to an enemy engaged with his player, 2 if its engagement cost is higher than that player's threat.                                                                                          |
| Halfling Determination | Choose a Hobbit character in play: +2 willpower, attack and defense until the end of the phase.                                                                                                                                                                     |
| Smoke Rings            | Reduce your threat by 1 for each Pipe attachment you control; each hero with a Pipe attachment gets +1 willpower until the end of the phase.                                                                                                                        |
| Take No Notice         | Costs 1 less for each Hobbit or Ranger hero you control. Each enemy in play gets +5 engagement cost until the end of the round.                                                                                                                                     |
| Frodo's Intuition      | Paid with the Ring-bearer's Fellowship resources. Each hero you control gets +1 willpower until the end of the round; draw 1 card for each Hobbit hero you control.                                                                                                 |
| Hobbit Cloak           | Attach to a Hobbit hero, one per hero. +2 defense while defending against an enemy whose engagement cost is higher than your threat.                                                                                                                                |
| Dagger of Westernesse  | Attach to a hero; Restricted. +1 attack, +2 instead while attacking an enemy whose engagement cost is higher than your threat.                                                                                                                                      |
| Hobbit Pipe            | Attach to a Hobbit character, one per character. Response: after your threat is reduced by an event card effect, exhaust it to draw a card.                                                                                                                         |

Interpretations:

- **"Higher than your threat"** compares the enemy's current engagement
  cost, with Pippin and Take No Notice included, to the threat of the player
  the card refers to. In this engine an attachment on a character is
  controlled by that character's controller, so the Cloak and the Dagger
  read that player's threat.
- **Sam and Pippin** only respond to their own player's engagements. Each
  engagement triggers them again; the responses are optional and Pippin's is
  offered only while his player has a card to draw.
- **Fatty Bolger** raises the threat by the enemy's threat even if another
  effect already stops it from contributing; a later return to the staging
  area in the same phase keeps it from contributing. Enemies immune to player
  card effects cannot be chosen.
- **Bill the Pony**: an attachment played on him while his text box is blank
  is discarded as soon as his text is active again. When he leaves play the
  Hobbits lose the hit point, which can destroy a damaged Hobbit.
- **Barliman Butterbur** is an extra legal target in the undefended damage
  choice; the defending player may still choose a hero.
- **Merry** offers only exhausted characters that can be readied, from any
  player who took part in the attack.
- **Smoke Rings** counts Pipes on any character, by controller, and gives the
  willpower to any player's hero with a Pipe.
- **Take No Notice** and **Frodo's Intuition** affect the enemies and heroes
  in play when they resolve; later arrivals are not affected (FAQ 1.55).
- **Events need an effect.** As for other events in the project, Halfling
  Determination needs a Hobbit character, Smoke Rings a Pipe and Take No
  Notice an enemy in play.
- **Hobbit Pipe** recognises an event by the source of the reduction, or by
  the event still resolving when the source is not given. Each ready Pipe of
  the player whose threat went down may respond.

Engine additions:

- Player-card hooks for engagement cost, stats, the play cost, engagement,
  ally entry, attacks that destroy an enemy, defense against an attacker,
  undefended damage targets and threat reduction.
- The deck builder no longer offers the Fellowship Ring-bearer as a chosen
  hero (setup already refused him), lists the Fellowship sphere in its
  filter, and warns that Fellowship cards are paid with the Ring-bearer's
  resources in The Lord of the Rings scenarios only.

## Verification

```sh
node --import tsx --test tests/black-riders-player-cards.test.ts tests/black-riders-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-black-riders-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`node scripts/test-preview.mjs --port 5178`).

`tests/black-riders-player-cards.test.ts` (13 tests) covers deck-building
eligibility, the pinned scans and corrected texts, and every card through
the real actions: engagement, attack, defense, ability, play, choices and
the end of the phase and round, with a two-player check of Pippin and Sam.

`tests/black-riders-player-games.test.ts` plays four seeded complete games
(A Shadow of the Past and Passage Through Mirkwood, each solo and with two
players) with a 50-card Hobbit deck. The first player uses Sam Gamgee,
Merry and Fatty Bolger, with Frodo in the Saga; the second uses Pippin,
Legolas and Gimli. A greedy policy plays every new card and ability whenever
it is legal and accepts every new response; Merry and Fatty stay out of the
quest. Every action is followed by an exact save restoration, and A Shadow
of the Past also runs its physical-card and privacy observer. The test
checks that every new card is played and that every response, Fatty's
action and Barliman's damage happen.

`scripts/browser-black-riders-players.mjs` uses the real controls at 1280,
390 and 320 px, with no page or console errors: the fourteen faces as
pinned, Sam's and Pippin's responses, Merry's, Fatty's action, Barliman's
undefended damage, Farmer Maggot's response, Bill the Pony, Halfling
Determination's target, Smoke Rings with the Pipe response, Take No Notice,
Frodo's Intuition, the Hobbit Cloak target and the Dagger (48 checkpoints).
