# The Mines of Moria

The Fellowship event scenario of 2019 (`the-mines-of-moria`), played
cooperatively in classic solo and with one to four local players, in normal
and easy mode. There has been no news of Balin's expedition for years: the
players defeat The Watcher at the West-door, cross the Black Pit and search
the Mines for the Chamber of Mazarbul.

The players **build** the scenario before the first round, as in The Wizard's
Quest and The Woodland Realm, with the shared Fellowship event module
(`src/game/fellowship-event*.ts`). The quest deck is To the West-door and one
of the three stage 2 cards and one of the three stage 3 cards; the encounter
deck is 7 of the 14 encounter sets of 5 cards (the quick build). The first
player makes each choice in the quick-build dialogs, or lets the remaining
choices be made at random (deterministically from the game's seed). Unlike
the earlier events, 1A gives each hero a resource and adds only The Watcher;
the shared module takes 1A's setup from each scenario.

## Sources and corrections

- The recipe matches
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Mines-of-Moria):
  70 encounter cards in 14 sets numbered 1 to 14, set aside with The Watcher
  and the 7 quest cards (78 cards, recipe Q99.13). Each set has 5 cards with a
  total printed cost of 3, so every quick-built encounter deck holds 35 cards
  costing 21.
- The immutable snapshot `src/data/pending/the-mines-of-moria-import.json`
  (SHA-256
  `f083be9236e0c641012afc05809ecc30ea59e1f647012f33e2cc0442be8daf41`) holds
  the 50 cards; `tests/mines-moria-source-quantities.json` keeps every card's
  quantity, type, set and cost.
- `tests/mines-moria-art.json` pins all **58 faces** (the 7 quest cards and The
  Watcher have two faces). Every face was checked by eye against the catalog,
  which the scans correct:
  - The catalog has **no cost** for any card: every encounter card's cost is
    read from the "COST" box in the lower right corner of its scan.
  - Chamber of Mazarbul, The Watcher's location side, is a separate face with
    the scan's statistics: unique, Underground., X threat, 5 quest points,
    victory 5.
  - The catalog writes every apostrophe and quotation mark as a backtick.
  - Drums in the Deep lacks its first paragraph, "Enemies cannot take damage
    while Chamber of Mazarbul is in the staging area."
  - Typos: 2A "(cost 2 or less", Shadow of Fear "attaches", Denizen of the
    Deep "Denizen" and "as a Condition", Zigil Mineshaft "the [threat]" (no
    "total"), Goblin Follower's closing quotation mark, Stairs of Náin's title
    in its text, Goblin Warlord's missing full stop; Brood Mother is a Spider.
    Denizen of the Deep's printed condition text has no closing quotation mark,
    and stays so.
  - The catalog prints no shadow effect; the scans add the 22 shadow effects.
    It also runs paragraphs together on the quest cards, The Watcher, Chamber
    of Mazarbul and many encounter cards; the paragraphs follow the scans.
- Hall of Beorn gives the scenario no difficulty rating; the atlas rates it 5.
- **Easy mode** keeps the whole recipe (the event predates easy-mode icons) and
  gives each hero its additional starting resource.
- **Not supported**: the advanced build and the competitive mode, in which two
  teams each play their own game and resolve the 'opposing team' effects for
  each other.

## The cooperative rules

Each effect that names **the opposing team** is resolved by the first player,
who is asked to resolve it in the way that provides the greatest challenge:
the searches of 2A, 3A, The Long Dark of Moria, Drums in the Deep, Spider
Burrow, Goblin Tunnels, Goblin Warlord, Goblin Sneak, They Are Coming! and
Hidden Threat, the order of A Presence in the Dark's two cards, Narrow Paths'
attachments, Shadow of Fear's hero, Denizen of the Deep's enemy, Sudden
Pitfall's ally and They Are Coming!'s shadow. Choices an encounter card leaves
to the players (Web-spinner, Foul Air, The Fate of Balin) are made by the
first player.

## Setup and stages

| Stage                              | Quest points | Rules                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B To the West-door             | 5            | Setup: each hero gains 1 resource and The Watcher joins the staging area. With 5 progress on the stage, The Watcher is considered engaged with each player and attacks each of them in the combat phase. Defeated, it flips to Chamber of Mazarbul (staged); the stage cannot be defeated while it is in play. |
| 2A Journey in the Black Pit (each) | –            | The opposing team reveals a card from the top 5 with cost 1 or less (2 or less with two or more players); its 'when revealed' effects cannot be canceled.                                                                                                                                                      |
| 2B A Presence in the Dark          | 20           | At the beginning of each staging step, the opposing team puts 1 of the top 2 encounter cards on the bottom and the other back on top.                                                                                                                                                                          |
| 2B The Long Dark of Moria          | 20           | When revealed, the opposing team adds one different 0 cost location per player from the encounter deck or discard pile.                                                                                                                                                                                        |
| 2B Narrow Paths                    | 20           | When revealed, an attachment controlled by each player is guarded under the stage (with a blank text box); attachments with those titles cannot be played. Defeated, the stage returns each to its owner's hand.                                                                                               |
| 3A Search for the Chamber (each)   | –            | As 2A, with cost 2 or less (3 or less with two or more players).                                                                                                                                                                                                                                               |
| 3B Drums in the Deep               | 10           | Enemies cannot take damage while Chamber of Mazarbul is in the staging area. When revealed, the opposing team adds an enemy. Cannot be defeated while an enemy is in play; defeating the stage wins.                                                                                                           |
| 3B The Fate of Balin               | 20           | At the beginning of each staging step, the first player reveals an additional card or allows no more than 5 progress on the stage this phase. Cannot be defeated while Chamber of Mazarbul is in play; defeating the stage wins.                                                                               |
| 3B Continuing Eastward             | 15           | Each staged location gets +1 threat and +3 quest points; the explored active location reveals the top encounter card. Cannot be defeated while Chamber of Mazarbul is in play; defeating the stage wins.                                                                                                       |

**The Watcher** is immune to player card effects, cannot be optionally engaged
and gets +2 threat and +4 hit points per player. **Chamber of Mazarbul** is
immune too, has X threat (1 more than the stage number) and cannot be traveled
to before stage 3B; traveling there makes each player discard a random card,
and explored it goes to the victory display (5 points).

The scenario panel shows the side and its rule, the chosen stage 2 and stage 3
cards (or the quick build in progress), the encounter sets, The Watcher or
Chamber of Mazarbul, Narrow Paths' guarded attachments, Hidden Threat's cards
and the progress the stage can still take this phase. The journey counts 3
stages; the atlas lists all 7 quest cards under their stage numbers.

## Encounter cards

| Set | Cards                                                    | Behaviour                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Savage Werewolf, Many-pillared Hall ×3, Shadow of Fear   | The Werewolf attacks again (without a shadow card) after a blank shadow card; shadow: an additional attack. The Hall gets +1 threat per staged copy; shadow: discard an attachment from the defender. Shadow of Fear blanks a hero's text box (Traits stay).                                                                              |
| 2   | Deep-dweller ×2, Darkened Stairway ×2, We Cannot Get Out | Deep-dweller returns each engaged Spider; shadow +1 attack (+2 for a Spider). The Stairway reveals a card after a 'when revealed' effect is canceled; travel: the top card is discarded and a treachery resolves. We Cannot Get Out adds the most characters a player controls as threat this phase; shadow: 1 damage per engaged enemy.  |
| 3   | Spider Broodling ×3, Spider Burrow, Grabbed by Spiders   | The Broodling removes 2 progress after it engages; shadow +1 attack, 2 progress if it destroys. The Burrow gives Spiders +1 defense and, explored, adds a Spider of cost 1 or less. Grabbed by Spiders removes a questing character per Spider in play, else surge; shadow: the defender cannot ready this round.                         |
| 4   | Moria Bats ×2, Ancient Guardroom, Denizen of the Deep ×2 | The Bats surge; shadow: shuffled into the deck. The Guardroom gets +1 threat per resource, a resource after each event, and travel deals its threat as damage among characters in play. Denizen attaches to a non-unique enemy (+1 threat, attack and defense, immune), which returns to the staging area; else surge.                    |
| 5   | Werewolf ×2, Fouled Well, Cave In ×2                     | The Werewolf gets -10 engagement cost with an active location. The Well stops player card readying and, on travel, exhausts a character per player. Cave In returns the active location and deals its threat as damage to each player, else surge; shadow: the active location returns if the attack destroys.                            |
| 6   | Hive Guardian, Abandoned Mines ×3, Sudden Pitfall        | The Guardian returns to the staging area after it destroys an ally; shadow: the attacker returns. The Mines take no progress in the staging area; shadow: an enemy that engaged this round takes no damage this phase. Sudden Pitfall discards an ally, else surge; shadow: an ally or no damage this phase.                              |
| 7   | Web-spinner ×2, Cobwebbed Cavern ×2, Foul Air            | Web-spinner caps the current quest at 4 progress this phase, or surges; shadow: the attacker returns if it destroys. The Cavern removes 2 progress on travel and as a shadow. Foul Air deals 1 damage to each quester, or raises each threat by 1 and ends the quest phase without resolving the quest; shadow: 1 damage to the defender. |
| 8   | Brood Mother, Lightless Passage ×2, Lurking Malice ×2    | Brood Mother takes only combat damage, has no player attachments and, staged, allows 5 progress on the quest each round. The Passage allows 1 progress per staged location each round; travel: a random discard per player. Lurking Malice turns every hero resource into staged threat, else surge; shadow: a resource.                  |
| 9   | Dark and Dreadful ×3, Great Cave-troll, Zigil Mineshaft  | Dark and Dreadful discards a random card per player and adds their costs as threat this phase; shadow: a random discard. The Troll has no player attachments and raises each threat by 2 after the encounter phase. Zigil Mineshaft's Quest Action: the first player raises each threat by 1 for -1 threat this phase.                    |
| 10  | Goblin Follower ×2, Stairs of Náin, Hidden Threat ×2     | The Follower cannot be optionally engaged and engages each player another enemy engages. The Stairs give the first treachery each round surge and keep it uncanceled; explored, each threat +4. Hidden Threat puts a card from the top 5 under the quest, revealed after the next successful quest.                                       |
| 11  | Goblin Warlord, Dwarven Forge ×2, Signs of Conflict ×2   | The Warlord takes only combat damage, has no player attachments and brings a 0 cost Goblin as it enters play. The Forge, explored as the active location, lets each player draw. Signs of Conflict gives staged enemies and locations +1 threat this phase; shadow +1 attack (+2 with another enemy engaged).                             |
| 12  | Goblin Archer ×2, Narrow Fissure ×2, Crumbling Ruin      | The Archer deals 1 damage per enemy in play among characters after the encounter phase. The Fissure stops healing and, on travel, damages a hero per player. Crumbling Ruin: 1 damage per character controlled, per player; shadow: exhaust a character.                                                                                  |
| 13  | Goblin Sneak ×2, Plundered Armoury ×2, They Are Coming!  | The Sneak adds a Goblin of cost 1 or less from the top 5; shadow +1 attack. The Armoury stages the top card if it is an enemy. They Are Coming! adds one different 0 cost enemy per player; shadow: an enemy from the discard pile is shuffled back.                                                                                      |
| 14  | Swarming Goblins ×3, Goblin Tunnels, Massing in the Deep | Swarming Goblins return every copy in the discard pile to the staging area; shadow: a Goblin attacker brings one engaged. The Tunnels give Goblins +1 attack and, explored, add a Goblin of cost 1 or less. Massing in the Deep makes each engaged enemy attack, else surge; shadow: your enemies +1 attack this phase.                   |

Interpretations:

- **The Watcher's flip** happens when it is destroyed: Chamber of Mazarbul is
  added to the staging area and The Watcher's card is not discarded.
- **Searches of the top 5 cards** that do not say to shuffle (Goblin Sneak,
  Hidden Threat) leave the other cards in place.
- **Lurking Malice's threat**, like We Cannot Get Out's and Dark and Dreadful's,
  counts until the end of the phase.
- **Foul Air's end of the quest phase** also cancels the staging step's
  remaining reveals.
- **Stairs of Náin** looks at the first treachery revealed each round by any
  effect; it keeps surge and its uncancelable effects until the next card is
  revealed.
- **Goblin Warlord** searches only when a copy enters play, not when it
  returns to the staging area from engagement.
- **Ancient Guardroom's travel** and Goblin Archer's damage are assigned by the
  first player among all characters in play.
- **Massing in the Deep's shadow** lasts until the end of the phase.

## Verification

```sh
npm run test:engine
npm run test:mines-moria-simulation
npm run build
npm run test:browser-mines-moria
npm run audit:rules
```

The focused suites (`tests/mines-moria.test.ts`, 10 tests, and
`tests/mines-moria-cards.test.ts`, 14 tests, one per encounter set) cover the
quick build and its random choices, setup in one to four players and both
difficulties, The Watcher and Chamber of Mazarbul, every stage, search and win
condition, every enemy, location, treachery and shadow effect, and saves. The
source test pins the snapshot, every card's quantity, set and cost, the scan
corrections and all 58 faces.

The complete-game matrix (`npm run test:mines-moria-simulation`, in four CI
partitions: each difficulty's complete games and late-game starts) plays 44
games (6,607 actions) with exact save restoration after every action, physical
conservation (the box, the quest deck and the defeated quest cards, The Watcher
and Chamber of Mazarbul as one card, the guarded attachments, Hidden Threat's
cards and the treacheries being resolved) and private-view checks, and 18 exact
paced/immediate terminal-state comparisons. The quick build is random and each
'opposing team' choice takes the greatest challenge. From setup, the starter
decks lose all 14 games at To the West-door, the longest in round 8. The 10
games started at A Presence in the Dark, with Chamber of Mazarbul in the
staging area, lose (in easy mode one of them defeats the stage first), the
longest in round 10; the 10 started at the end of The Long Dark of Moria defeat
it, reveal 3A's card and lose at Drums in the Deep; of the 10 started in the
last push at The Fate of Balin, with 20 progress on the stage and Chamber of
Mazarbul the active location with 4 of its 5 quest points explored, 9 are won,
and the three-player game in normal mode is lost in round 7 (its quests fail,
and Cave In returns Chamber of Mazarbul to the staging area).

The browser suite runs eight native quick builds (both difficulties, one to
four players, a different stage 2 and stage 3 card and set each time) with
exact physical inventories, and shows the quick-build dialogs, all seven quest
cards front and back, The Watcher, Chamber of Mazarbul, 2A's search, A
Presence in the Dark, Narrow Paths' guarded attachment with Hidden Threat, The
Fate of Balin's choice and progress cap, and the victory at 1280/390/320px; it
checks all 58 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
