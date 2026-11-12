# The Hobbit: Over Hill and Under Hill player cards

The On the Doorstep player cards are described in
[their own page](OTD-PLAYER-SCRIPTS.md).

All 22 player cards of the box are scripted. Bilbo Baggins and the
treasures follow the Saga rules described with
[We Must Away, Ere Break of Day](WE-MUST-AWAY.md). Nori, Ori, Fili, Kili,
Dori, Cram, Thrór's Map, A Very Good Tale and Foe-hammer were already scripted
with the Dwarf, collector and Gondor card modules. The other nine cards are
scripted in `src/game/hobbit-player-cards.ts`.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The nine scans were downloaded from RingsDB and checked by eye against that
  text. They are pinned by size and SHA-256 in `tests/hobbit-player-art.json`.
- Four flavour texts that RingsDB leaves empty or omits (Bofur, Gandalf,
  Expecting Mischief, Burglar Baggins) were copied from the scans.

## Cards

| Card | Behaviour |
| --- | --- |
| Thorin Oakenshield | Collects 1 more resource in the resource phase while his controller controls at least 5 Dwarf characters, Thorin included. The bonus is a player card effect, so No End in Sight and Guard Tower block it. |
| Beorn | Sentinel. Attachments cannot be played on him or moved to him, and the We Must Away sack deck never puts him in a Sack. Immune to player card effects. He does not exhaust when declared as a defender, so while ready he can defend every attack in a round. |
| Bofur | Action: exhaust him to look at the top 5 cards of your deck, add 1 Weapon attachment among them to your hand (or none) and shuffle the deck. An encounter effect that forbids searching the deck blocks him. |
| Gandalf | Does not exhaust to commit to a quest. At the end of each refresh phase his controller either raises their threat by 2 to keep him or discards him from play. |
| Spare Hood and Cloak | Attaches to any character. Action: exhaust it and the attached character to ready another exhausted character that player card effects can ready, then attach it to that character (still exhausted) if the character can legally have it. |
| Goblin-cleaver | Combat Action. As it is played, exhaust a ready Weapon attached to a hero you control (you choose when there are several). Then deal 2 damage to the chosen enemy engaged with you, or 3 if it is an Orc. |
| Late Adventurer | Quest Action. As it is played, exhaust a ready character you control that is not committed and could commit to the quest. Then that character is committed. Its willpower counts, and responses to committing trigger. |
| Expecting Mischief | Only during the quest phase, before the staging step. The first enemy revealed from the encounter deck this phase takes 2 damage from each copy played. The damage is dealt after the enemy is placed. An enemy destroyed as it is revealed (Thalin) still uses up the effect. An immune enemy takes no damage but also uses it up. Once an enemy has been revealed, Expecting Mischief cannot be played again this phase. |
| Burglar Baggins | Bilbo Baggins gets +2 willpower, attack and defense until the end of the phase. Any player may pay for it from Bilbo's Baggins resources, even without controlling him, and the payment dialog lists Bilbo for that player. It cannot be played while Bilbo is out of play or immune to player card effects, for example in the Dungeons Deep riddle area. |

Interpretations:

- **Spare Hood and Cloak** only offers characters that are exhausted and can
  be readied. Readying is what the card is for, and a ready target would turn
  it into a way to move the attachment for free.
- **Expecting Mischief** cannot be played after an enemy has been revealed
  earlier in the same quest phase. That enemy was "the first enemy revealed
  this phase", so a copy played later would have no effect.

The deck builder can filter Baggins cards, and its advice explains that Burglar
Baggins is paid with Bilbo's resources, so it can only be played in The Hobbit
scenarios. While adding the box, two older events that need a target but never
showed the target picker were fixed: Knowledge of the Enemy (The Fortress of
Nurn) and Bartering (The Wilds of Rhovanion).

## Verification

```sh
node --import tsx --test tests/hobbit-player-cards.test.ts tests/hobbit-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-hobbit-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`npm run preview -- --port 5178 --strictPort`).

`tests/hobbit-player-cards.test.ts` covers deck-building eligibility, the
pinned scans and every card above. It drives the real actions: defend, commit,
play, ability, choice and the end of the refresh phase. Burglar Baggins is
tested in a two-player game where the player who does not control Bilbo pays
for it.

`tests/hobbit-player-games.test.ts` plays three seeded complete games
(Passage Through Mirkwood solo and with two players, We Must Away solo) with
50-card decks built around these cards. The first player uses Thorin, Beorn
and Éowyn; the second uses Denethor, Glorfindel and Thalin. A greedy
policy plays every new card and ability whenever it is legal. Every action is
followed by an exact save restoration, and We Must Away also runs its
physical-card and privacy observer. The test checks that each card, Gandalf's
refresh-phase choice, Expecting Mischief's damage and a Spare Hood and Cloak
move all happen.

`scripts/browser-hobbit-players.mjs` uses the real controls at 1280, 390 and
320 px, with no page or console errors:

- the Goblin-cleaver target picker;
- Burglar Baggins paid from Bilbo's pool by the second player;
- the new Knowledge of the Enemy target picker;
- Bofur's search;
- Spare Hood and Cloak's move;
- Gandalf's refresh-phase choice.
