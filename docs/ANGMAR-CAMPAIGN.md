# The Angmar Awakened campaign

Campaign mode for the nine scenarios of the Angmar Awakened cycle, with the
Angmar Awakened Campaign Expansion's campaign cards, boons and burdens (the
campaign pool CCC.3, 38 cards). The lobby's campaign mode offers it as the
third campaign, next to Mirkwood Paths and The Lord of the Rings, for one
fellowship of one to four local players. Its first three chapters, Intruders
in Chetwood, The Weather Hills and Deadmen's Dike, are supported; the campaign
log is kept after them, and the end of the game says that the next chapter,
The Wastes of Eriador, is not available in campaign mode yet.

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

## Not supported yet

The Wastes of Eriador, Escape from Mount Gram, Across the Ettenmoors, The
Treachery of Rhudaur, The Battle of Carn Dûm and The Dread Realm follow, with
their boons and burdens (Determination, Fend off Despair, Loot the Dungeons and
its six boons, Losing Time, the three Clue boons and the four Carn Dûm boons).
They also bring the later effects of cards earned so far: Iârion's Pendant in a
player's deck, Arnor Ravaged's setup and Forced effect, and Thaurdir's burdens'
setup in The Treachery of Rhudaur and The Battle of Carn Dûm.

## Verification

```sh
node --import tsx --test tests/angmar-campaign.test.ts
npm run build
npm run test:browser-angmar-campaign
```

`tests/angmar-campaign.test.ts` (12 tests) covers the registered cards' texts
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
and Amarthiúl's Courage. The browser suite starts a new Angmar Awakened
campaign through the lobby, plays Intruders in Chetwood's setup choice, records
its resolution, continues into The Weather Hills, attaches Hardy through
Mysterious Omens' choice, continues into Deadmen's Dike, moves Thaurdir's
Spite to a hero, answers the resolution's choice in the end-of-game dialog,
opens the campaign card's state in the quest inspector and checks the journal
at 1280, 390 and 320 pixels (33 checkpoints), and checks the 19 pinned faces.
