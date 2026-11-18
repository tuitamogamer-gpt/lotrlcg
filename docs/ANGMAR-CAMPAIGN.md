# The Angmar Awakened campaign

Campaign mode for the nine scenarios of the Angmar Awakened cycle, with the
Angmar Awakened Campaign Expansion's campaign cards, boons and burdens (the
campaign pool CCC.3, 38 cards). The lobby's campaign mode offers it as the
third campaign, next to Mirkwood Paths and The Lord of the Rings, for one
fellowship of one to four local players. All nine chapters are supported,
from Intruders in Chetwood to The Dread Realm, whose resolution wins the
campaign.

## Sources

- The campaign rules are the Revised Core Set's (Learn to Play, pages 30–31),
  as for Mirkwood Paths: the Campaign Log, fallen heroes, the +1 threat penalty
  for each replaced hero, the Campaign Pool and the Permanent keyword. The
  expansion's rulebook, as transcribed by
  [RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-angmar-awakened-campaign-expansion/rulebook),
  adds that the Amarthiúl hero cannot be used until a campaign card says so
  (The Battle of Carn Dûm's) and lists each scenario's campaign setup.
- All 38 cards of the expansion (48 faces, the nine campaign cards and
  Protect the Innocent being double-sided) were checked by eye against the
  DragnCards scans; the cards are added to `src/data/angmar-campaign-cards.json`
  and their faces pinned in `tests/angmar-campaign-art.json` chapter by chapter,
  with their scripts. The scans correct the catalog: Iârion's Pendant has
  Victory 1, Mysterious Omens 9 quest points and Victory 5, Fend off Despair 8
  quest points and Victory 10, Loot the Dungeons 4 quest points (+4 per player)
  and Victory 10; Protect the Innocent's quest points are "–"; the eighth card is
  "The Battle of Carn Dûm" (the catalog drops the circumflex); and Protect the
  Innocent's other side is the burden objective Arnor Ravaged (trait Doom.).
  Daechanar's Brand prints "Daechnar's Brand" in its own Response; the text is
  kept as printed.

## The campaign rules

- **Chapters**: the nine scenarios are played in order, beginning with
  Intruders in Chetwood; the players advance only after defeating the current
  scenario, and a lost chapter is replayed with the same log.
- **The fellowship**: each player's heroes are recorded at the start. A hero
  in its controller's discard pile at the end of a won chapter is a fallen
  hero and cannot be used again (no version of it either); its Permanent cards
  leave the Campaign Pool. Each player may replace one other hero between
  chapters; each replacement gives every player a permanent +1 starting threat
  penalty, and another version of the same hero is not a replacement.
- **Amarthiúl**: the Amarthiúl hero cannot be chosen before The Battle of
  Carn Dûm.
- **Free changes**: The Wastes of Eriador's and The Battle of Carn Dûm's
  campaign cards let each player change heroes without the +1 penalty; the
  interlude says so and its penalty preview counts none.
- **Boons in decks**: Iârion's Pendant, once chosen, may join a player's deck:
  the interlude before each chapter assigns it (or leaves it out), the log
  keeps the choice, and the card joins that deck before the starting hand.
  Each player's copy of Determination joins that player's deck in every
  chapter after The Wastes of Eriador. Loot the Dungeons' boons, the Clue
  boons of The Treachery of Rhudaur and The Battle of Carn Dûm's boons join
  the deck of the player who took them, and the interlude can reassign them
  like Iârion's Pendant.
- **Banned cards**: the unique cards a player left in their captured deck at
  the end of Escape from Mount Gram are left out of that player's deck in the
  later chapters; the journal lists them.
- **Starting threat**: each defeat of Fend off Despair lowers every player's
  starting threat by 2 in the later chapters (cumulatively, never below 0).
- **The campaign card** of each chapter lies next to the quest deck (the quest
  inspector opens it and shows its state); its Setup resolves with the
  scenario's setup and its Resolution after a win. A Resolution that asks the
  players for a choice (Deadmen's Dike's) is answered in the end-of-game
  dialog, and the campaign continues once it is recorded.
- **The Campaign Pool** keeps the earned boons and burdens. A side quest in it
  (Mysterious Omens) is shuffled into each later encounter deck. A Permanent
  boon is recorded with the hero it is attached to and is attached to that hero
  again at the start of each later chapter (its Setup text resolves then:
  Cunning adds 2 resources); a fallen hero's Permanent boons leave the pool,
  and a hero changed between chapters keeps them in the log for when it
  returns, as in The Lord of the Rings campaign. Changes made during a lost
  chapter are not recorded: it is replayed with the same log.

## Intruders in Chetwood (Part 1)

| Card                                          | Behaviour                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign card                                 | Setup: Protect the Innocent enters the staging area; starting with the first player, each player may place 4 damage on it to add 1 resource to each of their heroes. Iârion's Pendant is attached to Iârion when he enters play with the scenario's setup. Resolution: Protect the Innocent's damage is noted in the Campaign Log, and it joins the Campaign Pool. |
| Protect the Innocent (side quest)             | After an attack damages a character, 1 damage is placed on it. Progress that would be placed on it removes that much damage instead, so it is never defeated. With 10 or more damage (20 or more with three or four players), the players lose.                                                                                                                    |
| Iârion's Pendant (boon attachment, Victory 1) | +1 willpower. Response: add it to the victory display to cancel the "when revealed" effects of a card just revealed from the encounter deck, or a shadow effect just triggered.                                                                                                                                                                                    |

## The Weather Hills (Part 2)

| Card                                                     | Behaviour                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                            | Setup: Mysterious Omens is added to the Campaign Log and shuffled into the encounter deck; Protect the Innocent enters the staging area with the damage noted in the log. Resolution: Protect the Innocent's damage replaces the noted number.                                                                                    |
| Mysterious Omens (side quest, 9 quest points, Victory 5) | Surge. After it becomes the current quest, each player discards 1 random card from their hand. When it is defeated it leaves the Campaign Pool (with the chapter's resolution), and each player in turn may attach one of Cunning, Hardy, Resolute, Ruthless and Stalwart, not already taken, to a hero they control (Permanent). |
| Cunning (boon, Permanent Condition)                      | Setup: +2 resources to its hero's pool. Action: its hero gets +2 willpower, +2 attack and +2 defense until the end of the phase (once per game).                                                                                                                                                                                  |
| Hardy (boon, Permanent Condition)                        | +2 hit points. Action: ready its hero (once per game).                                                                                                                                                                                                                                                                            |
| Resolute (boon, Permanent Condition)                     | +1 willpower. Response: cancel up to 2 points of damage just dealt to its hero (once per game); the window opens before the damage is placed, after every other prevention effect.                                                                                                                                                |
| Ruthless (boon, Permanent Condition)                     | +1 attack. Action: move any amount of damage from its hero to an enemy engaged with you (once per game); moved damage is not dealt, and an enemy with damage equal to its hit points is destroyed unless it is indestructible.                                                                                                    |
| Stalwart (boon, Permanent Condition)                     | +1 defense. Planning Action: play an attachment from your discard pile on its hero, paying its cost (once per game); the choice lists only attachments that can be played there, and Deadmen's Dike's discard pile rule forbids it.                                                                                               |

## Deadmen's Dike (Part 3)

| Card                                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                            | Setup: Iârion's Pendant is attached to Iârion as he enters play with the scenario's setup; Protect the Innocent enters the staging area with its noted damage. Forced: after Thaurdir enters play (stage 2), one of his three burdens is attached to him at random. Resolution: Protect the Innocent's damage replaces the note, and Arnor Ravaged (its other side) takes its place in the Campaign Pool; Thaurdir's burden joins the pool; the players choose Iârion's Pendant or Amarthiúl's Courage for the pool.                                                   |
| Thaurdir's Legacy, Majesty and Spite (burden objectives) | Thaurdir keeps his burden although he cannot have attachments (the campaign card attaches it). After a Sorcery treachery is revealed, each burden in play moves to the hero with the most resources (Legacy), the most non-objective attachments (Majesty) or the most damage (Spite); the first player breaks ties. On a hero each counts as a Sorcery attachment: -2 willpower and a blank text box (Legacy), -2 attack and it cannot commit to the quest (Majesty), -2 defense and it cannot be healed (Spite). A burden that leaves play is removed from the game. |
| Amarthiúl's Courage (boon attachment)                    | Attached to Amarthiúl as he enters play with a scenario's setup (the objective ally of The Wastes of Eriador, Across the Ettenmoors and The Treachery of Rhudaur, or the Amarthiúl hero); otherwise it stays out of the game. +1 willpower and +1 hit point. Action: ready Amarthiúl (once per game).                                                                                                                                                                                                                                                                  |

## The Wastes of Eriador (Part 4)

| Card                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                             | Setup: heroes change without the +1 penalty; each player adds 1 copy of Determination to their starting hand (it stays there through a mulligan); Fend off Despair is shuffled into the encounter deck. Resolution: each player's Determination and Fend off Despair join the Campaign Pool. Amarthiúl's Courage, if earned, is attached to the objective ally Amarthiúl. |
| Determination (boon event, cost 1)                        | Action: attach it to a unique character (it stays in play as a Condition attachment), then ready each character with a Determination attached and each character the log marks "determined". When the players win, each character with a Determination attached is marked "determined".                                                                                   |
| Fend off Despair (side quest, 8 quest points, Victory 10) | While it is in play each event gains doomed 1 (each player raises their threat by 1 as it is played). When it is defeated, every player's starting threat is lowered by 2 in the later chapters (recorded on a win; cumulative). Once in the pool it is shuffled into each later encounter deck.                                                                          |
| Arnor Ravaged (burden objective, Doom.)                   | Protect the Innocent's other side, a runtime card of its own (10158.B, its scan's back face). Setup: it enters the staging area with the damage noted in the log. Forced: after an attack damages a character but does not destroy it, 1 of its damage moves to that character (and can destroy it).                                                                      |

## Escape from Mount Gram (Part 5)

| Card                                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                              | Setup: the Permanent boons of the heroes added to a captured deck are set aside (they leave play with them); once each player has formed their captured deck, Loot the Dungeons enters the staging area and captures the bottom 5 cards of each captured deck. Other side: each refresh phase, each player raises their threat by the completed quest cards plus the side quests in the victory display instead of 1; a rescued hero takes back the Permanent boons the log assigns to it. Resolution: the unique cards still in a player's captured deck, and not in play, are banned from that player's deck for the rest of the campaign. |
| Loot the Dungeons (side quest, 4 quest points, Victory 10) | It is in each player's staging area: once the staging areas split, it follows the area being resolved (as Arnor Ravaged does), so each area sees and can quest against the same card. +4 quest points per player in the game. When it is defeated, the cards captured beneath it are rescued, and each player in turn may add a different one of its six boons to their hand; a won chapter pools them.                                                                                                                                                                                                                                      |
| Berelind (boon ally, cost 1)                               | Response: after Berelind attacks and destroys an enemy, place 1 progress on a quest card in play (the main quest or a side quest).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Chieftain's Brooch (boon attachment, cost 2)               | Attach to a hero. Each ally that shares a Trait with that hero gets +1 willpower.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Coruhaer (boon ally, cost 0)                               | Response: after Coruhaer defends an attack, spend 1 resource from a hero you control to deal 2 damage to the attacking enemy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Laermuin (boon ally, cost 2)                               | Response: after Laermuin commits to a quest, heal 1 damage from a character.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Mail of Eärnur (boon attachment, cost 1)                   | Attach to a hero: +2 hit points. Response: after a player's threat is reduced, heal 1 damage from that hero.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Silverthorn (boon attachment, cost 0)                      | Attach to a hero: +1 attack and +1 defense while attacking or defending against an enemy that shares a Trait with an enemy in the victory display. Response (once per game): after that hero attacks and destroys an enemy, add it to the victory display from the encounter discard pile.                                                                                                                                                                                                                                                                                                                                                   |

## Across the Ettenmoors (Part 6)

| Card                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                            | Setup: the 5 Losing Time treacheries are set aside, out of play. Forced: at the beginning of each quest phase, 1 resource is placed on the campaign card; at 3, 3 are removed to reveal a set-aside Losing Time (its effects resolve, Iârion's Pendant can cancel them) and place it in the encounter discard pile. Resolution: each copy of Losing Time in the encounter deck or discard pile joins the Campaign Pool. |
| Losing Time (burden treachery, 5 copies) | Surge. When Revealed: each player chooses to raise their threat by 3 or exhaust a hero they control. Shadow: the defending player gives the attacking enemy +3 attack or +3 defense until the end of the phase. The copies in the pool are shuffled into each later encounter deck.                                                                                                                                     |

## The Treachery of Rhudaur (Part 7)

| Card                                          | Behaviour                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                 | Resolution: for each Clue a player controls, that player may add the boon of the same name to the Campaign Pool and their deck (the end-of-game dialog asks, one question per Clue). Thaurdir's burdens in the pool are attached to the set-aside Thaurdir at setup, and move from him after a Sorcery treachery. |
| Daechanar's Brand (boon attachment, cost 0)   | Attach to a hero: +1 attack (+2 when attacking an Undead enemy). Response: after it is played, search the top 5 cards of the encounter deck for a Sorcery treachery, add it to the victory display and shuffle the encounter deck.                                                                                |
| Heirloom of Iârchon (boon attachment, cost 0) | Attach to a hero: +1 willpower. Response: after it is played, heal all damage from that hero.                                                                                                                                                                                                                     |
| Orders from Angmar (boon attachment, cost 0)  | Attach to a hero: +1 defense (+2 while defending against an Undead enemy). Response: after it is played, discard a non-unique Undead enemy with 2 or less remaining hit points.                                                                                                                                   |

## The Battle of Carn Dûm (Part 8)

| Card                                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                       | Setup: heroes change without the +1 penalty and the Amarthiúl hero may be chosen; then each player in turn order may add Elrond's Champion, Lore of Ancient Arnor, Raiment of the Second Age or Rivendell Skirmishers to their opening hand (a boon taken by an earlier player is not offered again; the card stays through a mulligan). Thaurdir's burdens attach to Thaurdir as the scenario puts him in the staging area. Resolution: the chosen boons join the Campaign Pool and their players' decks, and the damage on each hero is noted in the Campaign Log (the journal lists it). |
| Elrond's Champion (boon ally, cost 3)               | 2 willpower, 3 attack, 1 defense, 5 hit points. Response: after an enemy engages you, ready Elrond's Champion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Lore of Ancient Arnor (boon event, cost 3)          | Action: each player returns 1 card from their discard pile to their hand (2 as the only player) and shuffles the rest of their discard pile into their deck; then the event is removed from the game (it stays in the Campaign Pool).                                                                                                                                                                                                                                                                                                                                                       |
| Raiment of the Second Age (boon attachment, cost 3) | Attach to a character, Restricted: +2 attack and +2 hit points. Response: after attached character attacks and destroys an enemy, draw 1 card.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Rivendell Skirmishers (boon ally, cost 3)           | 2 willpower, 2 attack, 3 defense, 3 hit points. Response: after it exhausts to defend an attack from a non-unique enemy, discard each shadow card from that enemy (before they are revealed).                                                                                                                                                                                                                                                                                                                                                                                               |

## The Dread Realm (Part 9)

| Card          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card | Setup: each hero begins the game with the damage noted for it after The Battle of Carn Dûm (a hero without a note has none), and each player may search their deck for a boon card and add it to their opening hand (it stays through a mulligan; the deck is shuffled). Resolution: the players win the campaign; the end-of-game dialog and the journal say so, and no chapter follows. |

Thaurdir does not appear in The Dread Realm, so his burdens are removed from
that game (as in the chapters without him).

## Verification

```sh
node --import tsx --test tests/angmar-campaign.test.ts
npm run build
npm run test:browser-angmar-campaign
```

`tests/angmar-campaign.test.ts` (26 tests) covers the registered cards' texts
and faces, the chapter order and the Amarthiúl rule, Intruders in Chetwood's
setup (one or two players), Iârion's Pendant on Iârion and its bonus,
Protect the Innocent's damage, progress and loss, the Pendant's two
cancellations, the resolution, fallen heroes, saves and the continuation into
The Weather Hills; The Weather Hills' setup (also when replayed), Mysterious
Omens' discard and its boon choices (one player, and two players taking
different boons), its resolution, and the five boons' bonuses, Actions and
Response, their once-per-game limits and their return at the next setup;
Deadmen's Dike's setup and Thaurdir's random burden, the three burdens'
moves, ties and effects, their removal, the resolution's choice and its checks,
and Amarthiúl's Courage; The Wastes of Eriador's free changes, its
Determination in the starting hand and through a mulligan, Iârion's Pendant
in its assigned deck, Determination's attachment, readying and "determined"
log, Fend off Despair's doomed 1 and its starting threat reduction, and Arnor
Ravaged's damage; Escape from Mount Gram's captured boons, Loot the Dungeons'
captures, its place in each staging area (two players), its quest points,
defeat, rescue and boon choices, the refresh threat, the bans and their later
decks, and the six boons' scripts; Across the Ettenmoors' set-aside Losing
Time, the campaign card's resources and reveal, Losing Time's two choices and
its shadow, and the copies pooled; The Treachery of Rhudaur's returning pool
cards, the set-aside Thaurdir's burden, the Clue questions and the three Clue
boons, and the free changes into The Battle of Carn Dûm (with Amarthiúl); The
Battle of Carn Dûm's boon choices (one player, two players in turn order, a
skip and a mulligan), Thaurdir's burden, the noted damage, the pooled boon in
its deck, and the four boons' scripts; The Dread Realm's starting damage, its
boon search, the won campaign and the end of the chapters. The browser suite starts a new Angmar Awakened
campaign through the lobby, plays Intruders in Chetwood's setup choice, records
its resolution, continues into The Weather Hills, attaches Hardy through
Mysterious Omens' choice, continues into Deadmen's Dike, moves Thaurdir's
Spite to a hero, answers the resolution's choice in the end-of-game dialog,
puts Iârion's Pendant in a deck in the interlude, continues into The Wastes
of Eriador, Escape from Mount Gram, Across the Ettenmoors, The Treachery of
Rhudaur, The Battle of Carn Dûm (taking Raiment of the Second Age) and The
Dread Realm (searching the deck for it) and records their resolutions (a Clue
boon through the dialog, the noted damage, the won campaign), opens the
campaign card's state in the quest inspector and checks the journal at 1280,
390 and 320 pixels (75 checkpoints), and checks the 48 pinned faces.
