# The Lord of the Rings campaign

Campaign mode for the eighteen Lord of the Rings Saga scenarios (recipes
Q0C.01–Q0C.18), played by one fellowship of one to four local players. The
lobby's campaign mode now offers two campaigns: Mirkwood Paths (the three Core
Set quests) and The Lord of the Rings. The three chapters of The Black Riders
are supported: A Shadow of the Past, A Knife in the Dark and Flight to the
Ford. The campaign log is kept after Flight to the Ford, and the lobby says
when the next chapter, The Ring Goes South, becomes available.

## Sources

- The campaign rules come from The Black Riders' rulebook (Campaign Mode, the
  Campaign Log, the Campaign Pool, boons, burdens and the Permanent keyword).
- The three campaign cards (front and back) and the eight boons and burdens of
  The Black Riders were checked by eye against the scans; all 14 faces are
  pinned in `tests/saga-campaign-art.json` and the cards are in
  `src/data/saga-campaign-cards.json`.
- The scans correct one catalog text: Gandalf's Delay reads "Each player draws
  1 less card in his starting hand" (Hall of Beorn agrees), where the catalog
  says "Skip the draw cards step during the first round of the game". The scans
  also give Mr. Underhill's Victory 1, and the catalog's markup and run-together
  paragraphs are tidied.

## The campaign rules

- **Chapters**: the scenarios are played in order; the players advance only
  after defeating the current scenario. A lost chapter is replayed with the
  same campaign log, without a penalty.
- **The fellowship**: each player's heroes are recorded at the start (the
  Fellowship Ring-bearer, Frodo Baggins, joins the first player as in every
  Saga scenario and is not chosen). A hero in its controller's discard pile at
  the end of a won chapter is a **fallen hero** and cannot be used again; its
  player chooses a new hero for the next chapter. Each player may also replace
  one other hero voluntarily. Each replacement gives every player a permanent
  +1 starting threat penalty.
- **The campaign card** of each scenario lies next to the quest deck; its Setup
  resolves after the scenario's own setup, and its Resolution is recorded after
  a win. Resolutions that ask for choices are answered in the end-of-game
  dialog before the campaign continues.
- **The Campaign Pool** lists the boons and burdens the players earned. At the
  start of each later chapter, Permanent boons are attached to the heroes
  recorded in the log (Mr. Underhill to the Ring-bearer), boons with an
  encounter card back (Gildor Inglorion) and the burdens join the encounter
  deck, and Gandalf's Delay goes to the staging area (each player draws 1 less
  card in their starting hand). A fallen hero's Permanent cards leave the pool.
- **Permanent**: a Permanent attachment cannot be discarded from its hero while
  the hero is in play; when the hero leaves play, it is removed from the game.

## The Black Riders chapters

| Chapter              | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Shadow of the Past | Setup: Mr. Underhill is attached to the Ring-bearer, Gandalf's Delay is added to the staging area, and Gildor Inglorion and The Ring Draws Them are shuffled into the encounter deck. Resolution: choose Gandalf's Delay or The Ring Draws Them, then Gildor Inglorion or Mr. Underhill, for the Campaign Pool.                                                                                                                                      |
| A Knife in the Dark  | Resolution: starting with the first player, each player may choose one of Tireless Ranger, Skilled Healer, Valiant Warrior and Noble Hero and attach it to a hero they control (Permanent).                                                                                                                                                                                                                                                          |
| Flight to the Ford   | Response: after an enemy is declared as an attacker, shuffle the top card of the burden deck into the encounter deck to cancel that attack (offered to the attacked player for the group). Resolution: each burden card in play, in the encounter deck and in the discard pile is added to the Campaign Pool. The Old Road's campaign-only Action is offered: place the top burden on top of the encounter deck to place 4 progress on The Old Road. |

## Boons and burdens

| Card                                                                              | Behaviour                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mr. Underhill (boon, Permanent)                                                   | Attached to the Ring-bearer. Action: add it to the victory display (Victory 1) to choose an enemy engaged with you; that enemy cannot attack you until the end of the round.     |
| Tireless Ranger, Skilled Healer, Valiant Warrior, Noble Hero (boons, Permanent)   | +1 defense and Ranger, +2 hit points and Healer, +1 attack and Warrior, +1 willpower and Noble.                                                                                  |
| Gildor Inglorion (boon, objective-ally)                                           | Revealed from the encounter deck, the first player gains control of him. Forced: at the end of the round he is discarded unless the first player spends 1 [fellowship] resource. |
| Gandalf's Delay (burden, objective)                                               | Setup: added to the staging area; each player draws 1 less card in their starting hand.                                                                                          |
| The Ring Draws Them (burden, treachery)                                           | Surge. When Revealed: at the end of the phase, each enemy in the staging area engages the first player; it cannot be canceled while The One Ring is exhausted.                   |
| Weight of the Ring, Fear of Discovery, Eaten Alive!, Panicked, Overcome by Terror | Flight to the Ford's burden deck (already scripted); earned by its resolution and shuffled into later encounter decks.                                                           |

## Not supported yet

The campaign cards, boons and burdens of The Road Darkens, The Treason of
Saruman, The Land of Shadow, The Flame of the West and The Mountain of Fire,
and the campaign inserts of The Old Forest and Fog on the Barrow-downs, follow
in publication order. One campaign is saved at a time: starting a new campaign
replaces the saved one.

## Verification

```sh
node --import tsx --test tests/saga-campaign.test.ts
npm run build
npm run test:browser-saga-campaign
```

`tests/saga-campaign.test.ts` (5 tests) covers the data and faces, the recipe
support, A Shadow of the Past's campaign setup, both resolutions and the log
(fallen heroes, replacements and the threat penalty, the Campaign Pool and
Permanent boons in the next chapters, replaying a lost chapter), Flight to the
Ford's resolution and campaign Response, Mr. Underhill, Gildor Inglorion, The
Ring Draws Them, The Old Road's campaign Action and the Permanent stat boons.
The browser suite starts a new Lord of the Rings campaign through the lobby and
plays its log through all three chapters at 1280, 390 and 320 pixels (24
checkpoints: each chapter's setup, both resolution dialogs, the journal, the
campaign Response and the recorded end of Flight to the Ford) and checks all 14
original faces.
