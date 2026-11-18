# The Angmar Awakened campaign

Campaign mode for the nine scenarios of the Angmar Awakened cycle, with the
Angmar Awakened Campaign Expansion's campaign cards, boons and burdens (the
campaign pool CCC.3, 38 cards). The lobby's campaign mode offers it as the
third campaign, next to Mirkwood Paths and The Lord of the Rings, for one
fellowship of one to four local players. Its first chapter, Intruders in
Chetwood, is supported; the campaign log is kept after it, and the end of the
game says that the next chapter, The Weather Hills, is not available in
campaign mode yet.

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
  scenario's setup and its Resolution after a win.

## Intruders in Chetwood (Part 1)

| Card                                          | Behaviour                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign card                                 | Setup: Protect the Innocent enters the staging area; starting with the first player, each player may place 4 damage on it to add 1 resource to each of their heroes. Iârion's Pendant is attached to Iârion when he enters play with the scenario's setup. Resolution: Protect the Innocent's damage is noted in the Campaign Log, and it joins the Campaign Pool. |
| Protect the Innocent (side quest)             | After an attack damages a character, 1 damage is placed on it. Progress that would be placed on it removes that much damage instead, so it is never defeated. With 10 or more damage (20 or more with three or four players), the players lose.                                                                                                                    |
| Iârion's Pendant (boon attachment, Victory 1) | +1 willpower. Response: add it to the victory display to cancel the "when revealed" effects of a card just revealed from the encounter deck, or a shadow effect just triggered.                                                                                                                                                                                    |

## Not supported yet

The Weather Hills, Deadmen's Dike, The Wastes of Eriador, Escape from Mount
Gram, Across the Ettenmoors, The Treachery of Rhudaur, The Battle of Carn Dûm
and The Dread Realm follow, with their boons and burdens (Mysterious Omens and
the five Permanent boons, Thaurdir's three burdens, Amarthiúl's Courage,
Arnor Ravaged, Determination, Fend off Despair, Loot the Dungeons and its six
boons, Losing Time, the three Clue boons and the four Carn Dûm boons).

## Verification

```sh
node --import tsx --test tests/angmar-campaign.test.ts
npm run build
npm run test:browser-angmar-campaign
```

`tests/angmar-campaign.test.ts` (5 tests) covers the registered cards' texts
and faces, the chapter order and the Amarthiúl rule, Intruders in Chetwood's
setup (one or two players), Iârion's Pendant on Iârion and its bonus,
Protect the Innocent's damage, progress and loss, the Pendant's two
cancellations, the resolution, fallen heroes, saves and the continuation's
checks. The browser suite starts a new Angmar Awakened campaign through the
lobby, plays Intruders in Chetwood's setup choice, opens the campaign card's
state in the quest inspector and records the resolution at 1280, 390 and 320
pixels (12 checkpoints), and checks the 5 pinned faces.
