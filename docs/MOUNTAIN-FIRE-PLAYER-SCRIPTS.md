# The Lord of the Rings: The Mountain of Fire player cards

The box has 14 player cards. Frodo Baggins and Aragorn, the Fellowship-sphere
heroes of its scenarios, are described with the Saga rules of
[The Tower of Cirith Ungol](CIRITH-UNGOL.md) and
[The Black Gate Opens](BLACK-GATE.md); Friend of Friends is a passive
attachment and Gwaihir the objective-ally of The Black Gate Opens. The other
ten are scripted in `src/game/mountain-fire-player-cards.ts`.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The ten scans were downloaded from RingsDB and checked by eye; they are
  pinned by size and SHA-256 in `tests/mountain-fire-player-art.json`. They
  correct Éomer's "to declare him as an attacker", Rosie Cotton's
  "([willpower], [attack], or [defense])", Orc Disguise's "Limit 1 per hero",
  "engagement check" and its doubled period, Raise the Shire's "search your
  entire deck", and the broken markup of Elladan's and Elrohir's Response.

## Cards

| Card                 | Behaviour                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Éomer                | Response: after Éomer commits to the quest, spend 1 resource from his pool to declare him as an attacker (and resolve his attack) against an enemy in the staging area.                                                                                                         |
| Tom Cotton           | While you are engaged with an enemy whose engagement cost is higher than your threat, the first Hobbit ally you play each round needs no resource match. Response: after a Hobbit ally enters play, it gets +2 attack until the end of the round.                               |
| Rosie Cotton         | Action: exhaust Rosie Cotton to add her willpower to a Hobbit hero's willpower, attack or defense until the end of the phase (limit once per phase).                                                                                                                            |
| Elfhelm              | Action: spend 1 resource from a Rohan hero's pool to put Elfhelm into play from your hand; at the end of the phase he is discarded if he is still in play.                                                                                                                      |
| Elladan              | +2 attack while Elrohir is in play. Response: after you optionally engage an Orc enemy, ready Elladan.                                                                                                                                                                          |
| Elrohir              | +2 defense while Elladan is in play. Response: after you optionally engage an Orc enemy, ready Elrohir.                                                                                                                                                                         |
| Orc Disguise         | Attach to the Ring-bearer (limit 1 per hero). An Orc making an engagement check with you gets +5 engagement cost. Response: after an Orc engages you, discard Orc Disguise; that enemy cannot attack you until the end of the round.                                            |
| Captains of the West | Quest Action: until the end of the phase, each Noble hero gets +1 willpower and does not exhaust to commit to the quest.                                                                                                                                                        |
| Gúthwinë             | Attach to a Rohan hero; Restricted. Response: after the attached hero is declared as an attacker, exhaust Gúthwinë for +2 attack for this attack; if the attack destroys an enemy, return a Rohan ally from your discard pile to your hand.                                     |
| Raise the Shire      | Response: after you engage an enemy, search the top 5 cards of your deck (your entire deck if that enemy's engagement cost is higher than your threat) for a Hobbit ally, put it into play and shuffle; at the end of the round it returns to your hand if it is still in play. |

Interpretations:

- **Éomer** is declared as an attacker although questing exhausted him: the
  Response exists for that moment, as players of the card read it. A ready
  Éomer (Captains of the West) exhausts as he is declared. The attack
  resolves at once against the enemy, which stays in the staging area if it
  survives; Éomer stays committed. The Response is offered only while he has
  a resource and there is an enemy in the staging area he can attack.
- **Tom Cotton's** first Hobbit ally is the first one the player plays each
  round, whether or not the exemption applied to it; the exemption removes
  the resource match only, never the cost or spending restrictions. His
  Response answers any Hobbit ally entering play, played or put into play,
  under any player's control.
- **Rosie Cotton's** willpower is read when she exhausts; a hero immune to
  player card effects cannot be chosen.
- **Elfhelm** is paid from a Rohan hero his player controls; with several,
  the player chooses which pool pays. Scenario restrictions on allies entering
  play and his unique title (the Spirit Elfhelm shares it) are checked first.
- **Elladan and Elrohir** look for any character with the other's title: the
  heroes of the Dwarrowdelf cycle count, and those heroes now count the
  allies too. Their Response follows the optional engagement of the encounter phase
  only, not an engagement check.
- **Orc Disguise's** +5 applies to an Orc's engagement cost only while that
  Orc checks against the Disguise's controller, in the engagement phase;
  every other comparison with the engagement cost uses the printed value. Its
  Response is offered to that player for any Orc engaging him, then the
  attack prevention lasts until the end of the round.
- **Captains of the West** affects the Noble heroes in play as it resolves;
  played after commitment it still adds the willpower to the quest.
- **Gúthwinë's** bonus ends with the attack; an enemy destroyed by that
  attack returns a Rohan ally of the controller's choice (no choice with one
  title).
- **Raise the Shire** answers any engagement of its player: optional
  engagement, engagement checks and encounter effects. The engagement cost is
  compared as the event resolves. Scenarios that forbid searching the deck
  (The Fate of Numenor) stop the search. An ally that leaves play and comes
  back is a new instance and stays.

## Checks

- `tests/mountain-fire-player-cards.test.ts` covers each card, the corrected
  texts and the pinned faces.
- `tests/mountain-fire-player-games.test.ts` plays seeded games with the
  cards in The Tower of Cirith Ungol and Mount Doom.
- `npm run test:browser-mountain-fire-players` checks the cards in the
  production build at 1280, 390 and 320 pixels.
