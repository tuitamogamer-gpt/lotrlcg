# The Lord of the Rings campaign

Campaign mode for the eighteen Lord of the Rings Saga scenarios (recipes
Q0C.01–Q0C.18) and the two print-on-demand chapters that may follow A Shadow
of the Past (Q0C.01.1 and Q0C.01.2), played by one fellowship of one to four
local players. The lobby's campaign mode offers two campaigns: Mirkwood Paths
(the three Core Set quests) and The Lord of the Rings. Every chapter is
supported: The Black Riders' (A Shadow of the Past, A Knife in the Dark and
Flight to the Ford), the optional Parts 1.1 and 1.2 (The Old Forest and Fog
on the Barrow-downs), The Road Darkens' (The Ring Goes South, Journey in the
Dark and Breaking of the Fellowship), The Treason of Saruman's (The Uruk-hai,
Helm's Deep and The Road to Isengard), The Land of Shadow's (The Passage of
the Marshes, Journey to the Cross-roads and Shelob's Lair), The Flame of the
West's (The Passing of the Grey Company, The Siege of Gondor and The Battle
of the Pelennor Fields) and The Mountain of Fire's (The Tower of Cirith
Ungol, The Black Gate Opens and Mount Doom). Mount Doom's resolution ends the
campaign: the first player destroys The One Ring and the players win, or
keeps it and they lose.

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
- The Old Forest's and Fog on the Barrow-downs' campaign cards (Parts 1.1 and
  1.2, both faces) and their boons, Old Bogey-stories and Ho! Tom Bombadil!,
  were checked by eye against the scans; with them, all 20 faces are pinned.
  The campaign cards' "You are playing Campaign Mode." line and the boons'
  Victory 1 come from the scans. RingsDB lists the boons' sphere as Neutral:
  boon cards need no resource match.
- The Road Darkens' FAQ, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-road-darkens/rulebook),
  rules that removing a boon from the Campaign Pool as part of a cost is
  recorded only after the scenario is defeated; Ho! Tom Bombadil! follows it.
- The Road Darkens' three campaign cards (both faces), its eight boons and
  its six new burdens were checked by eye against the scans (Lust for the
  Ring was already scripted with The Ring Goes South); with them, all 40 faces
  are pinned. The scans correct the catalog: the four Gifts of Lórien have
  Victory 3, Journey in the Dark's resolution reads "Grievous Wound" (the
  catalog misspells it), The Ring Goes South names "Andúril" and Breaking of
  the Fellowship "Lórien Rope", and Sting's Response is a paragraph of its own.
- The Road Darkens' FAQ (same transcript) also rules that no version (hero or
  ally) of a fallen hero can be used for the rest of the campaign, that a hero
  replaced by another version of the same hero is not a replacement, and that
  the Gifts' removal from the Campaign Pool waits for a win.
- The Treason of Saruman's three campaign cards (both faces), its six boons
  and Saruman's Voice were checked by eye against the scans (Poisoned Counsels
  was already scripted with Helm's Deep); with them, all 53 faces are pinned.
  The scans give the Palantír of Orthanc's Victory 5 and The Road to
  Isengard's "the first player has earned the Palantír of Orthanc" (the
  catalog says "the players"), and they confirm Beyond All Hope's +1
  willpower, +1 attack and +1 defense. The Treason of Saruman's rulebook, as
  transcribed by
  [RulesPal](https://rulespal.com/the-treason-of-saruman/rulebook), adds that
  no card titled Frodo Baggins can be used in its chapters and that a recorded
  Aragorn gives way to the Fellowship Aragorn without the threat penalty.
- The Land of Shadow's three campaign cards (both faces), Brace of Coneys,
  The Searching Eye and A Heavy Burden were checked by eye against the scans;
  with them, all 62 faces are pinned. The scans correct the catalog: The
  Passage of the Marshes' Setup begins "Each player may change hero cards
  without incurring the +1 threat penalty", Shelob's Lair's burden set icons
  are Helm's Deep's and The Road to Isengard's (the catalog says "RD"),
  Journey to the Cross-roads' Resolution (missing from the catalog) earns each
  shuffled Brace of Coneys and records the enemies under The Black Gate,
  Brace of Coneys is a Gift with Victory 2, and A Heavy Burden is Permanent.
  The Land of Shadow's rulebook, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-land-of-shadow/rulebook),
  adds that no card titled Aragorn can be used in its chapters in campaign
  mode.
- The Flame of the West's three campaign cards (both faces), the Army of the
  Dead boon and the campaign-only Corsair Fleet of The Battle of the Pelennor
  Fields (Gondor side, the box's card 72) were checked by eye against the
  scans. The first release gave that Corsair Fleet a local code and Hall of
  Beorn's scan; it now uses the catalog's identity and DragnCards' scan, and
  older saves are converted. With them, all 70 faces are pinned. The five burden set icons on the three cards
  are those of A Shadow of the Past, Flight to the Ford and The Ring Goes South
  (the same shapes as on The Treason of Saruman's cards), The Passage of the
  Marshes and Shelob's Lair. Esquire of Rohan, Esquire of Gondor, Overcome by
  Fear and Wraith on Wings were already pinned with their scenarios. The Flame
  of the West's rulebook, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-flame-of-the-west/rulebook),
  forbids cards titled Frodo Baggins and repeats The Treason of Saruman's
  Aragorn rules: a recorded Aragorn is replaced without the penalty, his
  Permanent cards are transferred to the Fellowship Aragorn, and a fallen
  Aragorn leaves the list of fallen heroes with a +1 penalty for each player.
- The Mountain of Fire's three campaign cards (both faces) were checked by
  eye against the scans; with them, all 76 faces are pinned. Gwaihir, the boon
  The Black Gate Opens earns, was already pinned with that scenario (its
  Shadow: "This attack deals no damage"), as were Shagrat and Last of the
  Company with The Tower of Cirith Ungol. The burden set icons of The Tower of
  Cirith Ungol and Mount Doom are those of Helm's Deep, The Road to Isengard
  and The Passing of the Grey Company; The Black Gate Opens shows The Flame of
  the West's five. The Mountain of Fire's rulebook, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-the-mountain-of-fire/rulebook),
  forbids Aragorn at The Tower of Cirith Ungol and Mount Doom and Frodo
  Baggins at The Black Gate Opens, and offers its Epic Multiplayer Mode as the
  campaign's grand finale.
- The two campaign cards are numbered Parts 1.1 and 1.2 of The Lord of the
  Rings: the chapters are played after A Shadow of the Past (Part 1) and
  before A Knife in the Dark (Part 2). Each is optional, and when both are
  played The Old Forest comes first.

## The campaign rules

- **Chapters**: the scenarios are played in order; the players advance only
  after defeating the current scenario. A lost chapter is replayed with the
  same campaign log, without a penalty. The Black Gate Opens is the
  exception: its players cannot win, so their defeat completes the chapter
  and its resolution is recorded at once. After A Shadow of the Past, the
  interlude's **Next chapter** list offers The Old Forest, Fog on the
  Barrow-downs and A Knife in the Dark (after The Old Forest: Fog on the
  Barrow-downs and A Knife in the Dark). A skipped chapter cannot be played
  later, and the journal marks it "Not included".
- **The fellowship**: each player's heroes are recorded at the start (the
  Fellowship Ring-bearer, Frodo Baggins, joins the first player as in every
  Saga scenario and is not chosen). A hero in its controller's discard pile at
  the end of a won chapter is a **fallen hero** and cannot be used again; its
  player chooses a new hero for the next chapter. Each player may also replace
  one other hero voluntarily. Each replacement gives every player a permanent
  +1 starting threat penalty; another version of the same hero (the same
  title) is not a replacement, and no version of a fallen hero can be chosen
  (an ally version of it is taken out of the decks at setup). The Ring Goes
  South, Helm's Deep, The Passage of the Marshes, The Passing of the Grey
  Company and the three chapters of The Mountain of Fire let each player
  change heroes freely, without the penalty. The Passage of the Marshes may also give
  a player a **personal** permanent +2 starting threat penalty, recorded in
  the log for that player alone.
- **The campaign card** of each scenario lies next to the quest deck; its Setup
  resolves after the scenario's own setup, and its Resolution is recorded after
  a win. Resolutions that ask for choices are answered in the end-of-game
  dialog before the campaign continues.
- **The Campaign Pool** lists the boons and burdens the players earned. At the
  start of each later chapter, Permanent boons are attached to the heroes
  recorded in the log (Mr. Underhill to the Ring-bearer), boons with an
  encounter card back (Gildor Inglorion) and the burdens join the encounter
  deck, and Gandalf's Delay goes to the staging area (each player draws 1 less
  card in their starting hand, also after a mulligan). Old Bogey-stories is
  attached by the first player to a hero in play, and Ho! Tom Bombadil! is
  added to the first player's hand (it stays there through a mulligan). The
  burden objectives Grievous Wound and Overcome by Grief go to the staging
  area, and an earned Gift of Lórien is attached by the first player to a hero
  in play. A fallen hero's Permanent cards leave the pool.
- **Boons in decks**: Sting, Mithril Shirt, Glamdring, Andúril and the
  Palantír of Orthanc are player cards. The interlude before each chapter
  after The Ring Goes South assigns each of them to a player's deck (or leaves
  it out); the assignment is kept in the log, and the cards do not count
  against the deck's size. Brace of Coneys is earned copy by copy: each copy
  joins its earner's deck by default, and the interlude lists every copy
  ("Brace of Coneys (copy 1)") so that it can join another player's deck or
  stay out.
- **Notes**: the captives Breaking of the Fellowship takes are recorded in the
  journal; The Uruk-hai takes each player's captive from them, and its win
  rescues them. Journey to the Cross-roads records the name and quantity of
  each enemy under The Black Gate ("Notes · under The Black Gate").
- **Burdens in decks**: Poisoned Counsels, earned by each player who holds a
  copy at the end of Helm's Deep, and The Searching Eye, earned at The Passage
  of the Marshes, are shuffled into their earners' decks after the starting
  hand of each later chapter. The cards a campaign card shuffles in after the
  starting hands (these burdens, The Passage of the Marshes' Searching Eye and
  Journey to the Cross-roads' Brace of Coneys) are held out of a mulligan's
  new hand, which by the rules is drawn before the campaign card's Setup.
- **The Treason of Saruman**: its chapters leave out the burden sets of A
  Shadow of the Past, Flight to the Ford and The Ring Goes South (Gandalf's
  Delay included), no card titled Frodo Baggins can be used, and a recorded
  Aragorn is set aside for the Fellowship Aragorn (replacing him costs no
  penalty). In hot-seat games the log keeps each player's hero count, so a
  set-aside Aragorn still counts.
- **The Fellowship Aragorn** (The Treason of Saruman and The Flame of the
  West): the Permanent cards of a recorded Aragorn are transferred to him (the
  log keeps them under "Aragorn (the Fellowship hero)"), Permanent boons earned
  on him follow him into later boxes, and a fallen Aragorn leaves the list of
  fallen heroes when one of these chapters begins, each player taking a
  permanent +1 threat penalty.
- **The Flame of the West**: its chapters forbid cards titled Frodo Baggins
  and leave out the burden sets of A Shadow of the Past, Flight to the Ford,
  The Ring Goes South, The Passage of the Marshes and Shelob's Lair. The cards
  say "from the encounter deck", but the only burdens with the last two icons,
  The Searching Eye and A Heavy Burden, are never there: they stay out of the
  players' decks and off the Ring-bearer as well. Overcome by Fear returns to
  the threat dial of each player the log records (its threat cannot be
  reduced; at the end of each round it raises that player's threat by 1 and
  may be set aside for 1 [fellowship] resource), and an earned Army of the
  Dead enters play under the first player's control (it follows the first
  player token and leaves the game when it leaves play).
- **The Land of Shadow**: its chapters leave out the burden sets of Helm's
  Deep and The Road to Isengard (Poisoned Counsels and Saruman's Voice), from
  the encounter deck and from each player's deck, and no card titled Aragorn
  can be used: the interlude fills a recorded Aragorn's slot with another hero
  (free at The Passage of the Marshes), and an Aragorn card is taken out of a
  deck at setup. Frodo's burdens (Gandalf's Delay included) return with the
  Ring-bearer.
- **The Mountain of Fire**: no card titled Aragorn can be used at The Tower
  of Cirith Ungol and Mount Doom, and none titled Frodo Baggins at The Black
  Gate Opens, where the Fellowship Aragorn leads as in The Flame of the West.
  The Tower of Cirith Ungol and Mount Doom leave out the burden sets of
  Helm's Deep, The Road to Isengard and The Passing of the Grey Company
  (Poisoned Counsels, Saruman's Voice and Overcome by Fear, which stays off
  the threat dials); The Black Gate Opens leaves out The Flame of the West's
  five. Each earned copy of Wraith on Wings enters the staging area at setup
  and keeps its text: a resource at the beginning of each quest phase (limit
  5), +1 threat and -1 engagement cost for each, and no non-Morgul
  attachments. The Esquires keep their bonuses outside The Battle of the
  Pelennor Fields, and an earned Gwaihir is shuffled into the encounter deck.
- **The quest inspector** shows the chapter's campaign card (it can be
  inspected from there) and its state: Mount Doom's resource tokens, the Item
  boons set aside or guarded by Shagrat at The Tower of Cirith Ungol, and
  Aragorn and the Harad enemies waiting at The Battle of the Pelennor Fields.
- **Permanent**: a Permanent attachment cannot be discarded from its hero while
  the hero is in play; when the hero leaves play, it is removed from the game.

## The Black Riders chapters

| Chapter              | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Shadow of the Past | Setup: Mr. Underhill is attached to the Ring-bearer, Gandalf's Delay is added to the staging area, and Gildor Inglorion and The Ring Draws Them are shuffled into the encounter deck. Resolution: choose Gandalf's Delay or The Ring Draws Them, then Gildor Inglorion or Mr. Underhill, for the Campaign Pool.                                                                                                                                      |
| A Knife in the Dark  | Resolution: starting with the first player, each player may choose one of Tireless Ranger, Skilled Healer, Valiant Warrior and Noble Hero and attach it to a hero they control (Permanent).                                                                                                                                                                                                                                                          |
| Flight to the Ford   | Response: after an enemy is declared as an attacker, shuffle the top card of the burden deck into the encounter deck to cancel that attack (offered to the attacked player for the group). Resolution: each burden card in play, in the encounter deck and in the discard pile is added to the Campaign Pool. The Old Road's campaign-only Action is offered: place the top burden on top of the encounter deck to place 4 progress on The Old Road. |

## The optional chapters

| Chapter                            | Campaign card                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Old Forest (Part 1.1)          | Setup: the first player attaches Old Bogey-stories to a hero in play. Resolution: if there are at least 12 damage tokens on Old Man Willow, the players earn Old Bogey-stories. |
| Fog on the Barrow-downs (Part 1.2) | While any player is at stage 4B (trapped inside a barrow), the first player cannot lose control of the first player token. Resolution: the players earn Ho! Tom Bombadil!.      |

## The Road Darkens chapters

| Chapter                    | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Ring Goes South        | Setup: each player may change heroes without the +1 threat penalty; the players earn Sting, Mithril Shirt, Glamdring and Andúril; starting with the first player, each player chooses one for their hand (kept through a mulligan) and the rest are shuffled into the first player's deck. Resolution: if Lust for the Ring is attached to a hero, the players earn it.                                                                                                                                                           |
| Journey in the Dark        | Setup: Pursued by the Enemy and Shadow of Fear are shuffled into the encounter deck; Grievous Wound and Overcome by Grief are added to the staging area. Resolution: the first player chooses one of the treacheries and one of the objectives for the Campaign Pool, or all four if The Balrog is still in play.                                                                                                                                                                                                                 |
| Breaking of the Fellowship | Setup: starting with the first player, each player chooses one of Phial of Galadriel, Three Golden Hairs, Lórien Rope and Leaf-wrapped Lembas and attaches it to a hero they control (earned); Followed by Night and Ill Fate are shuffled into the encounter deck. Resolution: a hero with Fallen into Evil attached becomes fallen; the first player chooses Followed by Night or Ill Fate for the Campaign Pool; each player chooses a hero they control (not the Ring-bearer or Aragorn) as a captive, recorded in the Notes. |

## The Treason of Saruman chapters

| Chapter              | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Uruk-hai         | Setup: Gildor Inglorion and Mr. Underhill leave the Campaign Pool; Frodo's burden sets stay out; each captive is the one recorded in the log. Resolution (pursuit value 25 or lower): either each player earns one Skill boon (Intimidation, Hands of a Healer, Forewarned, Leader of Men) for a hero with its trait, or one player earns Beyond All Hope and takes back a fallen hero in place of a hero they remove from the log, without the penalty. |
| Helm's Deep          | Setup: each player may change heroes without the penalty; Frodo's burden sets stay out. Resolution: each player with a copy of Poisoned Counsels in hand, deck or discard pile earns it.                                                                                                                                                                                                                                                                 |
| The Road to Isengard | Setup: Saruman's Voice is shuffled into the encounter deck; Frodo's burden sets stay out. Resolution: if any player has 3 or fewer cards in hand, the players earn Saruman's Voice; if any player has 3 or more, the first player earns the Palantír of Orthanc (a boon card for their deck).                                                                                                                                                            |

## The Land of Shadow chapters

| Chapter                    | Campaign card                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Passage of the Marshes | Setup: each player may change heroes without the penalty; each player shuffles 1 copy of The Searching Eye into their deck (after the starting hand); the burdens of Helm's Deep and The Road to Isengard stay out. Resolution: each player must choose a permanent +2 starting threat penalty (their own) or 1 copy of The Searching Eye for their deck. |
| Journey to the Cross-roads | Setup: each player must choose: 1 resource on each of their heroes, or 1 copy of Brace of Coneys shuffled into their deck. Resolution: each player who shuffled Brace of Coneys earns that copy; the name and quantity of each enemy under The Black Gate are recorded in the Notes.                                                                      |
| Shelob's Lair              | Setup: A Heavy Burden is attached to the Ring-bearer. Resolution: the players earn A Heavy Burden.                                                                                                                                                                                                                                                        |

## The Flame of the West chapters

| Chapter                           | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Passing of the Grey Company   | Setup: each player may change heroes without the penalty; the first player may raise each player's threat by 1 to search their deck for Andúril (kept through a mulligan); the five burden sets stay out. Resolution: each Overcome by Fear on a player's threat dial is earned for that player; the Army of the Dead boon is earned if the Army of the Dead enemy is in the victory display.                                                                                                                                                                                                                                                                                                      |
| The Siege of Gondor               | Setup: the Andúril search; the five burden sets stay out. Resolution: the resources on The Corsair Fleet are recorded in the Notes, and Army of the Dead leaves the Campaign Pool.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The Battle of the Pelennor Fields | Setup: the Harad enemies recorded under The Black Gate are set aside; the first player attaches Andúril and Banner of Elendil (taken from the players' cards) to Aragorn and sets him aside; The Corsair Fleet (Gondor side) enters the staging area with the recorded resources; at the beginning of each quest phase it loses 1 resource, and without any the first player takes control of Aragorn and it goes to the victory display. Forced: when the players advance to stage 5B, the set-aside Harad enemies are added to the staging area. Resolution: 1 copy of Wraith on Wings per player is earned, and an Esquire attached to a hero is earned for that hero's controller (Permanent). |

The Harad enemies of Journey to the Cross-roads keep their printed text in
The Battle of the Pelennor Fields: Man of Harad's random discard and Archery 1,
Haradrim Soldier's immediate attack, Haradrim Archer's X threat, Archery X and
damage, Captain of Harad's +1 attack and -10 engagement cost for each Harad
enemy, and Oliphaunt's exhausted allies, no attachments and at most 3 damage
each round.

Seat of Seeing's campaign response is scripted too: when it is explored, the
first player may remove a burden card in play, in the encounter deck or in the
discard pile from the game (and, once the scenario is won, from the Campaign
Pool), and the encounter deck is shuffled.

## The Mountain of Fire chapters

| Chapter                   | Campaign card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Tower of Cirith Ungol | Setup: each player may change heroes without the penalty; A Heavy Burden is attached to the hero with Last of the Company (when the players keep their hands); each player sets an Item boon from the Campaign Pool aside, out of play (never Andúril; the card leaves its deck, hand, discard pile or hero); the three burden sets stay out. Forced: when the players advance to stage 3A, A Heavy Burden moves to the Ring-bearer and Shagrat guards each set-aside boon; when Shagrat leaves play, each guarded boon returns to its owner's hand. Resolution: each boon Shagrat still guards leaves the Campaign Pool. Without Shagrat in play at stage 3A, the set-aside boons stay in the pool. |
| The Black Gate Opens      | Setup: each player may change heroes without the penalty; the first player may raise each player's threat by 1 to search their deck for Andúril; the five burden sets stay out. The players cannot win (Dire: they fall at 99 threat): their defeat completes the chapter. Resolution: the resource tokens on The Black Gate are recorded in the Notes, each Wraith on Wings in the victory display leaves the Campaign Pool, Gwaihir is earned if the first player controls him, and no hero becomes fallen.                                                                                                                                                                                        |
| Mount Doom                | Setup: each player may change heroes without the penalty; the campaign card holds as many resource tokens as the Notes record for The Black Gate; the three burden sets stay out. Forced: at the end of each round 1 token is removed, and with none left the players lose the game (the chapter is replayed). Resolution: the first player destroys The One Ring (the players win the campaign) or keeps it (they lose it); the journal and the end of the game record the outcome, and the campaign cannot continue.                                                                                                                                                                               |

## Boons and burdens

| Card                                                                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mr. Underhill (boon, Permanent)                                                     | Attached to the Ring-bearer. Action: add it to the victory display (Victory 1) to choose an enemy engaged with you; that enemy cannot attack you until the end of the round.                                                                                                                                                                                                                                                                                     |
| Tireless Ranger, Skilled Healer, Valiant Warrior, Noble Hero (boons, Permanent)     | +1 defense and Ranger, +2 hit points and Healer, +1 attack and Warrior, +1 willpower and Noble.                                                                                                                                                                                                                                                                                                                                                                  |
| Gildor Inglorion (boon, objective-ally)                                             | Revealed from the encounter deck, the first player gains control of him. Forced: at the end of the round he is discarded unless the first player spends 1 [fellowship] resource.                                                                                                                                                                                                                                                                                 |
| Gandalf's Delay (burden, objective)                                                 | Setup: added to the staging area; each player draws 1 less card in their starting hand.                                                                                                                                                                                                                                                                                                                                                                          |
| The Ring Draws Them (burden, treachery)                                             | Surge. When Revealed: at the end of the phase, each enemy in the staging area engages the first player; it cannot be canceled while The One Ring is exhausted.                                                                                                                                                                                                                                                                                                   |
| Weight of the Ring, Fear of Discovery, Eaten Alive!, Panicked, Overcome by Terror   | Flight to the Ford's burden deck (already scripted); earned by its resolution and shuffled into later encounter decks.                                                                                                                                                                                                                                                                                                                                           |
| Old Bogey-stories (boon, attachment)                                                | Setup: attached to a hero in play; its controller is that hero's controller. Action: add it to the victory display (Victory 1) to shuffle a hand of at least 6 cards into the deck, then draw 6. It stays in the Campaign Pool.                                                                                                                                                                                                                                  |
| Ho! Tom Bombadil! (boon, event)                                                     | Setup: added to the first player's hand. Response (offered with A Test of Will when an encounter card is revealed from the encounter deck): add it to the victory display (Victory 1) and remove it from the Campaign Pool to cancel the when revealed effects. As The Road Darkens' FAQ rules for the Gift boons, the removal is recorded only when the scenario is won: a lost chapter is replayed with it still in the pool. It is never played as an Action. |
| Sting (boon, attachment, cost 2)                                                    | Attach to a Hobbit hero; Restricted; +1 willpower, +1 attack and +1 defense. Response: after its hero exhausts to defend, discard the top card of the encounter deck and deal damage equal to its threat to the attacker.                                                                                                                                                                                                                                        |
| Mithril Shirt (boon, attachment, cost 1)                                            | Attach to the Ring-bearer; +1 defense and +1 hit point.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Glamdring (boon, attachment, cost 2)                                                | Attach to a Warrior hero or Gandalf; Restricted; +2 attack. Response: after its character destroys an Orc enemy, draw 1 card.                                                                                                                                                                                                                                                                                                                                    |
| Andúril (boon, attachment, cost 3)                                                  | Attach to a Noble hero or Aragorn; Restricted; +1 willpower, +1 attack and +1 defense. Response: after an attack its hero defended resolves, exhaust Andúril and the hero attacks that enemy (even exhausted by defending).                                                                                                                                                                                                                                      |
| Phial of Galadriel, Three Golden Hairs, Lórien Rope, Leaf-wrapped Lembas (Gifts)    | Action: add it to the victory display (Victory 3) and remove it from the Campaign Pool (recorded after a win) to give each enemy engaged with you -4 attack this round; to lower each player's threat by 3, then each player draws 3; to give each location in the staging area -2 threat this phase; to ready all heroes in play.                                                                                                                               |
| Lust for the Ring (burden, treachery)                                               | Peril. Surge. When Revealed: attach to a non-Fellowship hero. Forced: after The One Ring exhausts, each player raises their threat by 1 and its hero's willpower is 0 until the end of the round (in every later chapter).                                                                                                                                                                                                                                       |
| Shadow of Fear (burden, treachery)                                                  | Doomed 1. Surge. When Revealed: the printed text box of each character in play is blank (except Traits) until the end of the round. Shadow: the defending character does not count its defense.                                                                                                                                                                                                                                                                  |
| Pursued by the Enemy (burden, treachery)                                            | Doomed 1. Surge. When Revealed: each enemy engaged with a player makes an immediate attack. Shadow: the attacking enemy makes an additional attack after this one.                                                                                                                                                                                                                                                                                               |
| Grievous Wound, Overcome by Grief (burdens, objectives)                             | Setup: added to the staging area. After a hero takes damage, Grievous Wound attaches to it and deals it 1 damage each time it exhausts. After a character is destroyed, the first player attaches Overcome by Grief to a hero, which then exhausts (and cannot ready this round) whenever a character its controller controls is destroyed.                                                                                                                      |
| Intimidation, Hands of a Healer, Forewarned, Leader of Men (Skill boons, Permanent) | Warrior: exhaust it when its hero attacks a non-unique enemy alone, -2 defense for that attack. Healer: exhaust it and its hero to heal up to 3 damage from a hero. Ranger: exhaust it when its hero defends a non-unique enemy, discard 1 of its shadow cards. Noble: exhaust it after its hero quests successfully, +1 resource.                                                                                                                               |
| Beyond All Hope (boon, Permanent)                                                   | +1 willpower, +1 attack and +1 defense; its hero cannot have treachery card attachments (the campaign's own treacheries skip it).                                                                                                                                                                                                                                                                                                                                |
| Palantír of Orthanc (boon, attachment)                                              | Attach to the Fellowship Aragorn. Quest Action: exhaust it and Aragorn to discard the top encounter card; if his willpower is greater than its threat, add it to the victory display (Victory 5, out of the pool after a win) so that a player reveals 1 fewer encounter card this phase.                                                                                                                                                                        |
| Poisoned Counsels, Saruman's Voice (burdens)                                        | Poisoned Counsels works like a player card in its earner's deck. Saruman's Voice (Peril, Doomed 2) removes a hero from the quest (a questing one if any) and attaches to it; whenever that hero commits to the quest or is declared as an attacker or defender, its controller discards 1 card.                                                                                                                                                                  |
| Brace of Coneys (boon, event, Gift)                                                 | Play only if you control the Ring-bearer. Planning Action: add it to the victory display (Victory 2; it stays in the Campaign Pool) to choose 2 different effects: heal up to 2 damage from a hero, add 2 resources to a hero's pool, a player draws 2 cards, or a player reduces their threat by 2.                                                                                                                                                             |
| The Searching Eye (burden, treachery)                                               | Works like a player card in its earner's deck. Forced: after its player draws it, they exhaust each hero they control or reveal the top card of the encounter deck; as FAQ 1.44 rules for such choices, an option that cannot be performed in full (an exhausted hero, an empty encounter deck) is offered only when the other cannot be either. The treachery then goes to its owner's discard pile.                                                            |
| A Heavy Burden (burden, objective, Permanent)                                       | Setup: attached to the Ring-bearer. Forced: at the end of the planning phase, the first player chooses: each player raises their threat by 1, or the Ring-bearer exhausts (only while he is ready).                                                                                                                                                                                                                                                              |
| Overcome by Fear (burden, objective)                                                | Earned for each player whose threat dial carries it after The Passing of the Grey Company; attached to that dial in later chapters: the threat cannot be reduced, and at the end of each round it raises the threat by 1 and may be set aside for 1 [fellowship] resource.                                                                                                                                                                                       |
| Army of the Dead (boon, objective-ally)                                             | 4 willpower, 6 attack, 2 defense, 8 hit points; immune to player card effects. Setup: the first player takes control of it (it follows the first player token); it leaves the game when it leaves play. The Siege of Gondor's resolution removes it from the pool.                                                                                                                                                                                               |
| Gwaihir (boon, objective-ally)                                                      | Earned at The Black Gate Opens if the first player controls him (also when the last hot-seat fellowship falls, which takes their cards out of play), then shuffled into the encounter deck. When Revealed: the first player takes control of him, or spends 1 [fellowship] resource and discards him to discard a non-unique enemy in the staging area. Shadow: this attack deals no damage.                                                                     |
| Esquire of Rohan, Esquire of Gondor (boons, Permanent)                              | Earned on the hero they are attached to at the end of The Battle of the Pelennor Fields (that scenario attaches them at its own setup): the Rohan or Gondor trait and +1 attack while attacking with another Rohan character or +1 willpower while committed to the quest with another Gondor character, in every later chapter.                                                                                                                                 |
| Wraith on Wings (burden, enemy)                                                     | 1 copy per player is earned at The Battle of the Pelennor Fields; the log counts the copies. Setup: each copy is added to the staging area. Forced: at the beginning of each quest phase, 1 resource is placed on it (limit 5); +1 threat and -1 engagement cost for each resource; no non-Morgul attachments. Each copy in the victory display at the end of The Black Gate Opens leaves the Campaign Pool.                                                     |
| Followed by Night, Ill Fate (burdens, treacheries)                                  | Peril. Surge. Followed by Night puts the topmost enemy of the encounter discard pile into play engaged with you (in the staging area where enemies cannot engage). Ill Fate attaches to a hero you control; after a character you control is destroyed, raise your threat by 2.                                                                                                                                                                                  |

## Not supported yet

The Mountain of Fire's Epic Multiplayer Mode (The Black Gate Opens and Mount
Doom played at once by two groups, the Ring-bearer's controller choosing which
scenario receives each boon and burden) is not offered. Saruman's Voice does
not yet react to its hero's own abilities, and Beyond All Hope does not yet
stop the other scenarios' treachery attachments. One campaign is saved at a
time: starting a new campaign replaces the saved one.

## Verification

```sh
node --import tsx --test tests/saga-campaign.test.ts tests/saga-campaign-road-darkens.test.ts tests/saga-campaign-treason.test.ts tests/saga-campaign-land-shadow.test.ts tests/saga-campaign-flame-west.test.ts tests/saga-campaign-mountain-fire.test.ts
npm run build
npm run test:browser-saga-campaign
```

`tests/saga-campaign.test.ts` (7 tests) covers the data and faces, the recipe
support, A Shadow of the Past's campaign setup, both resolutions and the log
(fallen heroes, replacements and the threat penalty, the Campaign Pool and
Permanent boons in the next chapters, replaying a lost chapter), Flight to the
Ford's resolution and campaign Response, Mr. Underhill, Gildor Inglorion, The
Ring Draws Them, The Old Road's campaign Action, the Permanent stat boons, the
optional chapters (their order, skipping them, saves that break the order, Old
Bogey-stories' setup, Action and resolution, the Fog card's first player
token) and Ho! Tom Bombadil! (its setup, the mulligan, its Response and the
Campaign Pool). `tests/saga-campaign-road-darkens.test.ts` (7 tests) covers
The Road Darkens: its data and the scans' corrections, The Ring Goes South's
free hero changes and boon cards (the hand, the first player's deck, the
mulligan), same-title swaps and fallen heroes, the four player-card boons'
targets, bonuses and Responses, Lust for the Ring in a later chapter, Journey
in the Dark's setup, burdens and both resolutions, Breaking of the
Fellowship's Gifts, Followed by Night, Ill Fate, Seat of Seeing, Fallen into
Evil and the captives, the deck assignments and the saved log's checks.
`tests/saga-campaign-treason.test.ts` (6 tests) covers The Treason of
Saruman: its data, The Uruk-hai's setup, captives and both rewards (Beyond All
Hope included), Helm's Deep's free changes and Poisoned Counsels, Saruman's
Voice and The Road to Isengard's resolution, the six boons and the chapters'
restrictions. `tests/saga-campaign-land-shadow.test.ts` (6 tests) covers The
Land of Shadow: its data and the scans' corrections, The Passage of the
Marshes' free changes, its Aragorn rule, the burden sets left out and The
Searching Eye held out of a mulligan, The Searching Eye's choice and both
resolutions, Journey to the Cross-roads' choice, Brace of Coneys' timing,
cost and effects and the Black Gate's Notes, Shelob's Lair's Heavy Burden
(Permanent, its Forced effect, the resolution), and a hot-seat log with a
personal penalty, a per-player Searching Eye and a copy of Brace of Coneys
moved to another player's deck. `tests/saga-campaign-flame-west.test.ts` (6
tests) covers The Flame of the West: its data and scans, The Passing of the
Grey Company's free changes, Frodo rule, burden sets left out, Andúril search
and resolution, Overcome by Fear in a later chapter (no reduction, the round's
threat, the Fellowship resource), the Army of the Dead (in play, immune,
removed from the game, passed to a new first player), The Siege of Gondor's
resolution, The Battle of the Pelennor Fields' set-aside Aragorn and Harad
enemies, The Corsair Fleet, the Harad enemies' text, its resolution, the
campaign card's status lines, and the Fellowship Aragorn's rules (a fallen
Aragorn, the Permanent transfer). `tests/saga-campaign-mountain-fire.test.ts`
(6 tests) covers The Mountain of Fire: its data and scans, the whole
campaign's support, the burden sets left out and the forbidden titles, The
Tower of Cirith Ungol's Item boons (never Andúril), A Heavy Burden on the
Last of the Company hero and then the Ring-bearer at stage 3A, Shagrat's
guarded boons (lost with him in play, returned when he is defeated), The
Black Gate Opens' Andúril search, a defeat that completes the chapter
through a real action (no fallen heroes, the tokens, a slain Wraith on
Wings, Gwaihir), a hot-seat defeat with and without the first player's
Gwaihir, Mount Doom's tokens, its loss at 0 and both resolutions (the
campaign then ends), and Gwaihir, Wraith on Wings and the Esquires outside
their own scenarios. The browser suite starts a new Lord of the Rings
campaign through the lobby and plays its log through A Shadow of the Past,
both optional chapters (chosen in the interlude), A Knife in the Dark, Flight
to the Ford, The Road Darkens' three chapters, The Treason of Saruman's
three, The Land of Shadow's three, The Flame of the West's three and The
Mountain of Fire's three at 1280, 390 and 320 pixels (174 checkpoints:
each chapter's setup, both interlude choices and the deck assignments, the
resolution dialogs and journals, Ho! Tom Bombadil!'s Response, the Flight to
the Ford Response, The Searching Eye, Brace of Coneys played from hand, A
Heavy Burden, Overcome by Fear's Fellowship resource, The Corsair Fleet
bringing Aragorn, the Item boon set aside, Shagrat's guarded boon in the
quest inspector, The Black Gate's defeat ending the chapter, Mount Doom's
tokens and the won campaign) and checks all 76 original faces.
