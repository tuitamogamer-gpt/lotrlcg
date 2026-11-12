# The Hobbit: On the Doorstep player cards

All 24 player cards of the box are scripted. Bilbo Baggins and Bilbo's Magic
Ring are described with [Flies and Spiders](FLIES-SPIDERS.md) and the five
Erebor treasures with [The Lonely Mountain](LONELY-MOUNTAIN.md). Glóin and
King Under the Mountain were already scripted with the Dwarf card module. The
other fifteen are new: Óin, Bombur, Bifur and Dwalin are scripted in
`src/game/dwarf-player-cards.ts`, the other eleven in
`src/game/otd-player-cards.ts`.

## Sources

- The card text is the RingsDB text in `src/data/official-player-cards.json`.
  The fifteen scans were downloaded from RingsDB and checked by eye against
  that text. They are pinned by size and SHA-256 in
  `tests/hobbit-player-art.json`.
- Black Arrow prints **Victory 1**, which the catalog record omits; the card
  data adds it.
- Ravens of the Mountain and Expert Treasure-hunter carry official errata
  ([FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf)):
  "shuffle the encounter deck and look at its top card" and "Limit 1 per
  hero". The scans and the catalog already show the corrected text.
- The FAQ also defines a ranged attack (an attack by a character with the
  Ranged keyword against an enemy engaged with another player), limits
  Bombur to cards that count Dwarf characters, and rules that a player whose
  hero was given away with Desperate Alliance is not eliminated.
- Further rulings come from the
  [compiled designer correspondence](https://alongextendedparty.com/semi-official-errata-faq-1-10/),
  entries 3.044, 3.049, 3.052, 3.060, 3.063, 3.081, 3.135, 3.162, 3.171,
  3.174, 3.189 and 3.338. These are reproduced designer replies, not a
  publisher FAQ.

## Cards

| Card | Behaviour |
| --- | --- |
| Balin | Response, once per attack: when a shadow effect triggers during any attack, his controller pays 1 resource from Balin's own pool to cancel it. The attacking enemy is then dealt another shadow card, which is revealed and resolved next, during the same attack. |
| Bard the Bowman | Ranged. When he makes a ranged attack the enemy gets −2 defense until the end of the phase (not an enemy immune to player card effects). |
| Óin | While his controller has 5 Dwarf characters he gets +1 attack and the Tactics resource icon, so he can pay for Tactics cards. |
| Bombur | Counts as two whenever a card counts the Dwarf characters his controller has: Thorin Oakenshield, Ori, Glóin, Óin, Bifur and Dwalin. |
| Bifur | With 5 Dwarf characters (Bifur included), after he is played from hand his controller may draw 2 cards. Putting him into play another way does not trigger it. |
| Dwalin | Sentinel. Costs 2 less while the player playing him has 5 Dwarf characters. |
| Straight Shot | Action. As it is played, exhaust a ready Weapon attachment you control (you choose when there are several). Then discard the chosen non-unique enemy with 0 defense, engaged with any player or in the staging area. A discarded enemy is not destroyed and does not go to the victory display. |
| Desperate Alliance | Multiplayer only. Choose a hero you control (not Bilbo Baggins); another player (you choose with three or more) controls it and its resources until the end of the phase. One copy per phase for the whole group. |
| Ravens of the Mountain | Action. As it is played, exhaust a hero you control. Shuffle the encounter deck and look at its top card; place progress equal to its printed threat on the current quest. The card stays on top. |
| To me! O my kinsfolk! | With a Dwarf hero, put a Dwarf ally from your discard pile into play. At the end of the phase it goes to the bottom of your deck if it is still in play. |
| The Lucky Number | Choose a character other than Bilbo Baggins. It gets Bilbo's current total willpower, attack and defense until the end of the phase. Paid with Baggins resources by Bilbo's controller. |
| Great Yew Bow | Attaches to a hero with the printed Ranged keyword; Restricted. Combat Action: choose an enemy in the staging area, exhaust the bow and its hero, and the hero makes a ranged attack against it alone. |
| Black Arrow | Limit 1 per deck. Attaches to a hero with Ranged. Response: after the attached hero declares an attack, add it to the victory display (Victory 1) to give the hero +5 attack for that attack. |
| Thrór's Key | Attaches to a hero. Response: after a location is added to the staging area, attach the Key to it. The location's text box is then blank, except for traits; its threat, quest points and victory points remain. |
| Expert Treasure-hunter | Attaches to a hero; Limit 1 per hero. Response: after the attached hero quests successfully, name Ally, Attachment, Event, Treasure or Player Side Quest, then discard the top card of your deck; a card of the named type goes to your hand. |

Interpretations:

- **Balin**'s replacement shadow card resolves during the same attack:
  every shadow card dealt to the attacking enemy for an attack is resolved
  (designer ruling 3.174). Balin cannot cancel it, because his response is
  limited once per attack; other cancels still can. It stays with the enemy
  until the end of combat like the others.
- **Ranged attacks.** Bard's text applies to Great Yew Bow attacks, which
  the card calls ranged, and when Bard joins an attack against an enemy
  engaged with another player. Hands Upon the Bow grants a normal attack
  (3.049), so it does not trigger Bard.
- **Great Yew Bow** is used in the combat phase between attacks, not while
  an enemy attack is resolving. Like other attacks made by card effects, it
  does not use up the players' normal attack against that enemy (3.135).
- **Desperate Alliance**: only one copy per phase for all players (3.189).
  Bilbo Baggins would return to the first player at once (3.171), so he is
  not offered. It is played between attacks. If the lending player has been
  eliminated by the end of the phase, the hero is discarded.
- **Thrór's Key**'s response is not limited to the Key on a hero, so it can
  move on to a newer location; the previous location regains its text. It
  does not stop When Revealed effects (3.060) or Underworld (3.063), which
  resolve before it. A location immune to player card effects cannot be
  chosen. The location rules of the core set and of all six Hobbit
  scenarios read the blank text box; elsewhere, a scenario's location rules
  honour it where they read the blank flag.
- **Expert Treasure-hunter**: responses to the discard (Hidden Cache, Ered
  Luin Miner) resolve before the card would go to hand. A Miner put into
  play this way stays in play; ruling 3.338 returns it to hand instead. Each
  copy triggers separately (3.162).
- **To me! O my kinsfolk!** moves the ally only if it is still in play at
  the end of the phase (3.081).
- **The Lucky Number** fixes Bilbo's totals when it resolves. Unlike Burglar
  Baggins, it has no text that lets other players pay from Bilbo's pool.
- **Óin**'s gained Tactics icon is not a printed icon.
- **Bombur** counts only for cards that count the Dwarf characters you
  control; We Are Not Idle exhausts him as one character. Erebor Battle
  Master counts Dwarf allies, so Bombur, a hero, does not add to it.

Engine additions: Bombur's Dwarf count, a gained resource icon for Óin, an
ally cost reduction, a Great Yew Bow attack mode, a printed-keyword
attachment restriction, Balin's shadow-cancel option, an attackers-declared
hook for Bard and Black Arrow, a location-entered hook and blank location
text for Thrór's Key, a bottom-of-deck return, end-of-phase returns and
protection from elimination while a hero is lent.

## Verification

```sh
node --import tsx --test tests/otd-player-cards.test.ts tests/otd-player-games.test.ts
npm run test:engine
npm run build
npm run test:browser-otd-players
npm run audit:rules
```

The browser suite needs a preview server on port 5178
(`npm run preview -- --port 5178 --strictPort`).

`tests/otd-player-cards.test.ts` covers deck-building eligibility, the
pinned scans and every card above through the real actions: play, defend,
attack, ability, choice and the end of the phase. Desperate Alliance and
Bard's ranged attack are tested in two-player games.

`tests/otd-player-games.test.ts` plays four seeded complete games (Passage
Through Mirkwood solo and twice with two players, We Must Away with two
players) with 50-card decks built around these cards. The first player uses
Balin, Bard the Bowman and Bombur; the second uses Óin, Legolas and Gimli. A
greedy policy plays every new card and ability whenever it is legal and
accepts every new response; the Ranged heroes and characters without
willpower stay out of the quest for combat. Every action is followed by an
exact save restoration, and We Must Away also runs its physical-card and
privacy observer. The test checks that every new card is played and that
Balin's cancel, Bard's ranged attack, the Great Yew Bow action, Black Arrow,
Thrór's Key, Expert Treasure-hunter, Desperate Alliance's return, the
kinsfolk ally's return to the deck and Bifur's draw all happen.

`scripts/browser-otd-players.mjs` uses the real controls at 1280, 390 and
320 px, with no page or console errors: Balin's shadow response, the Straight
Shot, Desperate Alliance and The Lucky Number target pickers, the Ravens of
the Mountain look, the To me! O my kinsfolk! ally choice, the Great Yew Bow
action, the Black Arrow and Thrór's Key responses, the Expert
Treasure-hunter type choice and Bifur's draw.
