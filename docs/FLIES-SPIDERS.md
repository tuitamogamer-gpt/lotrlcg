# Flies and Spiders

The first scenario of **The Hobbit: On the Doorstep** (2013), the second Saga
expansion, follows [Dungeons Deep and Caverns Dim](DUNGEONS-DEEP.md). It is
playable in classic solo and with one to four local players, in normal and
easy mode. This import also adds the On the Doorstep Bilbo Baggins and the
treasure Bilbo's Magic Ring. The other Saga rules are described with
[We Must Away, Ere Break of Day](WE-MUST-AWAY.md), and
[The Lonely Mountain](LONELY-MOUNTAIN.md) follows.

## Sources and corrections

- The poison, unconscious, separate staging area, treasure and Bilbo rules
  follow the rules insert, summarised from the
  [RulesPal transcription](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-hobbit-on-the-doorstep/rulebook).
- Recipes Q0A.4 (39 encounter cards including The Spider's Glade) and E0A.4
  (27) match the normal and easy quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Flies-and-Spiders).
  They are recorded in `tests/flies-spiders-source-quantities.json`. The atlas
  difficulty of 6 rounds Hall of Beorn's community rating of 6.1.
- The recipe provides three copies of Bilbo's Magic Ring. At setup each player
  in turn order may shuffle one into their deck while copies remain, so in a
  four-player game the fourth player cannot add one.
- Sting, Orcrist and Glamdring, once discovered by the same heroes in We Must
  Away, may join decks here: the rules insert lists a treasure set for each On
  the Doorstep scenario, and Over Hill and Under Hill's is the only earlier one.
- The official FAQ answers that Crazy Cob still attacks when no character has
  poison; the first player then chooses the target.
- The immutable snapshot `src/data/pending/flies-and-spiders-import.json` has
  SHA-256
  `49815e4e1f812a0117b3b3d571a5224c10e23a5ad5298cf01cf3c632f130e749`.
- `tests/flies-spiders-art.json` pins all **24 faces**. All of them were
  checked by eye and confirm the catalog text.

## On the Doorstep Saga rules

| Rule | Behaviour |
| --- | --- |
| Bilbo Baggins | In On the Doorstep scenarios the first player controls this Bilbo instead of the Over Hill and Under Hill one. He does not count against the hero limit, cannot gain resources from non-treasure cards, follows the first player token and loses the game if he leaves play. Action: spend 1 Baggins resource to search your deck for a treasure and add it to your hand. |
| Bilbo's Magic Ring | Treasure: attach to Bilbo Baggins. Action (once per round): exhaust it and raise your threat by 1 to give Bilbo 1 Baggins resource. Response: after Bilbo exhausts to defend, exhaust it and raise your threat by 3 to cancel all damage from that attack. Winning Flies and Spiders discovers it for the hero group. |

## Poison and unconsciousness

- **Poison:** the character's controller attaches the top card of their deck
  to it facedown. Poison is a Condition with no other text. A character with
  any poison is *poisoned*. If the deck is empty, no poison is given.
- **Venom:** when a Venom enemy damages a character, that character gets
  1 poison.
- **Unconscious:** when a character's poison equals its printed hit points,
  it is rotated 180 degrees and its poison goes to the discard pile.
  Unconscious characters cannot quest, attack, defend, collect resources,
  trigger abilities, be poisoned or ready, except through effects that ready
  an unconscious character. Making a committed character unconscious removes
  it from the quest.

## Scenario rules

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1A/1B Into Mirkwood | 9 | Setup sets The Spider's Glade aside, offers the ring copies and reveals 1 card per player. |
| 2A/2B Lost in the Dark | – | Resolved as soon as it is revealed. With other players, the first player gets a separate staging area at stage 3 and the others advance to stage 4. Alone, the player discards the stage and every card in its staging area (not the active location or engaged enemies) and continues at stage 3. |
| 3A/3B Captured by Spiders | 11 | Every hero of the players in this staging area loses its resources, and the first player's characters except Bilbo are made unconscious. The first player token does not pass. Action: spend 2 Baggins resources to ready an unconscious character you control. When it is complete, the first player joins stage 4 at the end of the quest phase. |
| 4A/4B Battle with the Spiders | 3 | The Spider's Glade enters the staging area. No progress can be placed while it is in play. The same Baggins action is available. Defeating the stage wins and discovers Bilbo's Magic Ring. |

**Separate staging areas:** while the first player is at stage 3, each area
has its own staging area, active location, progress and quest card. Players
only interact with players in the same area, and "each player" effects count
only them. Each area reveals one card per player in it, resolves its own
quest (its first player presses Resolve quest) and makes its own travel
decision. Engagement checks run area by area. The original area keeps its
cards while all of its players are eliminated. When stage 3 is complete, the
enemies and locations of the first player's area (its active location
included) join the original staging area at the end of the quest phase.
Enemies engaged with the first player stay engaged.

| Card | Behaviour |
| --- | --- |
| Crazy Cob | When Revealed: it makes an immediate attack (with a shadow card) against the character with the most poison; the first player breaks ties. Undefended damage must go to that character. Shadow: each defender gets 1 poison. |
| Fat Spider | +3 attack while engaged with a player who controls a poisoned character. Shadow: each defender gets 1 poison; if undefended, the defending player gives 2 poison to a character they control. |
| Lazy Lob | When Revealed: each committed character gets 1 poison. Shadow: a poisoned defender is made unconscious. |
| Old Tomnoddy | At the end of each round, each player in its staging area gives a hero they control 1 poison. |
| Wicked Spider | Forced: when it attacks, the defending player attaches 1 poison to a character they control. Shadow: each defender gets 2 poison. |
| Dark Bats | After it damages a character, it attaches to that character as a −1/−1/−1 Condition once the attack ends. Shadow: the shadow card attaches to the defender. |
| Forest Stream | Poisoned characters cannot commit while it is active. Response: after it is explored, the first player discards up to 4 poison. |
| Giant Web | While active, each character gets −1/−1/−1 per poison. Response: after it is explored, ready an unconscious character. |
| Hidden Path | While active, staging-area locations get −1 threat. Travel: spend 2 Baggins resources. |
| The Spider's Glade | Immune to player card effects. Travel: exhaust Bilbo Baggins. At the start of each quest phase the first player of its area chooses a Spider enemy from the encounter deck to add to the staging area (two with 3 or more players there), then the deck is shuffled. |
| Caught in Webs | Choose a committed hero to remove from the quest and make unconscious; with no committed hero it gains surge. |
| Poisoned by Spiders | Each character takes damage equal to its poison; if none is damaged it gains surge. Shadow: the defending player discards an unconscious character they control (Bilbo included if he is the only one). |
| Fighting Among Friends | The first player names a sphere; non-Baggins characters of other spheres are removed from the quest. Shadow: +1 attack (+2 if undefended). |
| Weighed Down | Until the end of the round, exhausted characters get −1/−1/−1. Shadow: if the defender is destroyed by the attack, its controller raises their threat by 5. |

Interpretations:

- Unconscious characters are also exhausted, so effects that look for ready
  characters skip them.
- Any player in Bilbo's staging area may use the stage action, spending
  Bilbo's Baggins resources.
- If the original staging area defeats stage 4 while the first player is
  still at stage 3, the players win.

Engine additions: scenario hooks for one staging step, one quest resolution
and one travel decision per area, and for keeping the first player token. The
Wilderland cards (Dark Bats, Hidden Path, Weighed Down and Fighting Among
Friends) live in `src/game/wilderland.ts`, shared with The Lonely Mountain. A
`poison` flag on facedown attachments and an `unconscious` flag on
characters, which share the Sacked restrictions and also stop resource
collection. Bilbo's Magic Ring cancels the current attack's damage.

## Verification

```sh
npm run test:engine
npm run test:flies-spiders-simulation
npm run build
npm run test:browser-flies-spiders
npm run audit:rules
```

The focused suite covers:

- setup and inventory, poison and unconsciousness, and Venom;
- the solo and two-player stage flows, the separate staging areas
  (separate reveals and combining) and victory;
- every encounter card, the On the Doorstep Bilbo and Bilbo's Magic Ring;
- malformed saves.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation across both staging areas and
private-view checks.

The browser suite runs eight native setups with exact physical inventories.
It shows the quest cards and the poison and unconscious labels, and readies a
character with the stage action. It covers Crazy Cob's target choice, the
separate staging areas and victory. It runs at 1280/390/320px and checks all
24 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
