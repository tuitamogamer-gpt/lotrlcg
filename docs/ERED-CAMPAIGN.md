# The Ered Mithrin campaign

Campaign mode for the Ered Mithrin Campaign Expansion (2024, MEC115): its nine
scenarios are played in order with the Revised Core Set's Campaign Log, and
each campaign card, boon and burden changes the scenario it belongs to. Campaign
mode offers it as **Ered Mithrin**, next to Mirkwood Paths, The Lord of the
Rings, Angmar Awakened and Dream-chaser. The campaign begins with Journey Up
the Anduin; **its first three chapters are supported** (Journey Up the Anduin,
Lost in Mirkwood and The King's Quest), and the next chapters follow in
publication order (The Withered Heath is not available in campaign mode yet).

## Sources

- The campaign rules are the Revised Core Set's (Learn to Play, Campaign Mode):
  the Campaign Log, fallen heroes, the +1 threat penalty for each replaced hero
  and the Campaign Pool. MEC115's own rules
  ([its rulebook, hosted by RulesPal](https://rulespal.com/the-lord-of-the-rings-the-card-game-ered-mithrin-campaign-expansion/rulebook))
  add:
  - **Haldan cannot be used as a hero in this campaign**, until The King's
    Quest's campaign card says "Haldan may be included among a player's
    heroes".
  - **Treasure.** Treasure cards cannot be put in a deck until the players
    discover them in a scenario. Treasures marked in the Campaign Log may be
    added to a deck before a game: at most one copy of each title, and they do
    not count toward the 50-card minimum. Some abilities let the players
    choose 1 of 3 random undiscovered treasures.
  - **Encounter cards in the Campaign Pool.** An encounter card added to the
    Campaign Pool is written in the Campaign Log with its copies; the players
    cannot add more copies than one collection holds. When the encounter deck
    is built, the noted copies are added regardless of encounter set.
- The campaign card, its back, Turayn, A Growing Threat and the nine treasures
  (12 cards, 13 faces) were checked by eye against the DragnCards scans; they
  are added to `src/data/ered-campaign-cards.json` and pinned in
  `tests/ered-campaign-art.json`. Their encounter set ("Ered Mithrin
  Campaign") keeps them out of ordinary games.
- Lost in Mirkwood's and The King's Quest's campaign cards, Melanwar, Isolde,
  The Threat to Wilderland, Dagnir's Spawn and Abandoned Ruin (7 cards, 9
  faces) were checked the same way; all 19 cards and 22 faces are pinned.
- The scans correct the catalog: Turayn's text begins with "Sentinel." and A
  Growing Threat's with "Surge."; the treasures carry the TREASURE type line
  and the unique symbol. The second campaign card's title, printed in small
  capitals, is the scenario's "Lost in Mirkwood" (the catalog has "Lost In
  Mirkwood"). Dagnir's Spawn prints X threat and defense (X is the campaign
  card's part number). Their collector numbers (164–173 and 195–203) are one
  lower than the RingsDB codes, which the data keeps.
- The scans also correct the Wilds of Rhovanion data: The Old Ford, Woodmen
  Village, Bare Hilltop, Overgrown Path, Forest Clearing, Abandoned Village,
  Dragon Hoard and the Fire-drake carry the unique symbol (the campaign card
  counts only non-unique locations, and A Growing Threat skips unique cards).

## The campaign rules

- **Chapters**: Journey Up the Anduin, Lost in Mirkwood, The King's Quest, The
  Withered Heath, Roam Across Rhovanion, Fire in the Night, The Ghost of
  Framsburg, Mount Gundabad and The Fate of Wilderland. A lost chapter is
  replayed with the same Campaign Log. The King's Quest and The Ghost of
  Framsburg let each player change heroes without the +1 threat penalty.
- **The Campaign Log** records the discovered treasures, the notes the
  campaign cards mark ("Turayn has taken an oath of vigilance"), the boons and
  burdens, and the Campaign Pool's encounter cards with their copies (capped at
  the copies the collection holds).
- **Each setup** shuffles the Campaign Pool's burdens and encounter cards into
  the encounter deck. Before the starting hands, a boon ally in the Campaign
  Pool and each discovered treasure join the deck the interlude chose for it
  (or none): the interlude lists them as "Boons and discovered treasures in
  your decks".
- **Treasures.** "The players look at 3 random undiscovered treasures and
  choose 1 to attach to an eligible character": the first player chooses 1 of
  3 random treasures neither in the Campaign Log nor taken this game (fewer
  when fewer remain), the others return, and it attaches to a character it can
  attach to (Dwarf-Lord's Crown to a hero; Restricted as printed). The look is
  saved, so reloading shows the same three. At the resolution, "the players
  discover each treasure they control": each treasure attached to a character
  in play is recorded in the Campaign Log.
- **Guarded treasures.** A treasure a campaign card attaches "to a location as
  a guarded objective" (Twilight Hall, Abandoned Ruin) is kept beside its
  guard, not attached, so the location gains nothing from it; the quest
  inspector names it. "When free of encounters" (when the guard leaves play,
  explored), the players claim it: the first player attaches it to an eligible
  character. A guarded treasure counts as taken for the next random look.

## Journey Up the Anduin (Part 1)

| Card                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                       | Setup: Turayn enters play under a player's control (the first player chooses the player when several play); A Growing Threat is shuffled into the encounter deck. Response: after a non-unique location is explored (active or in the staging area), a resource goes on the campaign card; at 3 more than the number of players, the players look at 3 random undiscovered treasures and attach 1 (the Response only helps, so it is always used; the quest inspector shows the count). Resolution: the end-of-game dialog asks whether the heroes accept Turayn's aid (he joins the Campaign Pool; any player may add him to their deck) or the Campaign Log notes that "Turayn has taken an oath of vigilance"; the treasures the players control are discovered; A Growing Threat and each Evil Creatures enemy in play (the Wilderlands enemies of the Evil Creatures deck) join the Campaign Pool. |
| Turayn (unique boon ally)           | Sentinel. Response: after Turayn exhausts (for any reason), his controller may choose another character; the next time it would be dealt damage this round, 1 of that damage is canceled (not damage paid as a cost).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A Growing Threat (burden treachery) | Surge. When Revealed: the topmost non-unique, non-objective, non-burden card of the encounter discard pile is set aside, and a copy joins the Campaign Pool if the chapter is won (if a copy is left in the collection); A Growing Threat is removed from the game. It stays in the Campaign Pool for later chapters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Lost in Mirkwood (Part 2)

| Card                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card               | Setup: Melanwar enters play under a player's control (the first player chooses the player when several play). The first player may search the encounter deck for a copy of Twilight Hall (the deck is shuffled) and add it to the staging area; if they do, the players look at 3 random undiscovered treasures and 1 is guarded by Twilight Hall until it is explored. Resolution: Melanwar joins the Campaign Pool or the Campaign Log notes that "Melanwar has given you guidance on traversing Wilderland"; the treasures the players control are discovered; cards are discarded from the encounter deck (reshuffling the discard pile once if the deck runs out) until X cards of the Spiders of Mirkwood or Dol Guldur Orcs set are discarded (X is the number of players), and they join the Campaign Pool. |
| Melanwar (unique boon ally) | Ranged. Response, when the travel phase begins with an active location: exhaust him to place 1 progress on it, or 3 if the players quested unsuccessfully this round (his controller chooses whether to use it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## The King's Quest (Part 3)

| Card                                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                               | Setup: each player may change heroes without the +1 threat penalty (the interlude says so) and Haldan may be chosen; Isolde enters play under a player's control; The Threat to Wilderland enters the staging area, Dagnir's Spawn is shuffled into the encounter deck and Abandoned Ruin into the Caves deck. If "Turayn has taken an oath of vigilance", the first player chooses 3 treacheries in the encounter deck to remove from the game (then it is shuffled). Resolution: Isolde joins the Campaign Pool or the Campaign Log notes that "Isolde is on the hunt"; the treasures the players control are discovered; Abandoned Ruin joins the Campaign Pool, and the first player chooses The Threat to Wilderland or Dagnir's Spawn to join it too (both in the end-of-game dialog). |
| Isolde (unique boon ally)                   | +2 willpower while she has an Item attachment. Response: after her controller engages an enemy, she readies (always used: it only helps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The Threat to Wilderland (burden objective) | Setup: X resources, X the campaign card's part number. Forced: at the beginning of the quest phase, a resource is removed (with none left, nothing happens); then the first player chooses: each player's threat is raised by 2, or the encounter cards in play are immune to player card effects until the end of the quest phase (encounter cards entering play during the quest phase are too; the quest inspector says so).                                                                                                                                                                                                                                                                                                                                                              |
| Dagnir's Spawn (burden enemy)               | X threat and defense (the part number). It cannot have non-Dragon attachments. When Revealed: each player in turn may distribute X damage among the characters they control, 1 at a time; if every player does, it is shuffled into the encounter deck.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Abandoned Ruin (burden location)            | Setup: shuffled into the Caves deck if the scenario has one (The King's Quest's), otherwise removed from the game. Response: after it becomes the active location, the players look at 3 random undiscovered treasures and 1 is guarded by it, claimed when it is explored (always used, once per game for the group).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## The treasures

| Treasure             | Behaviour                                                                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anvil of Gundabad    | Attach to a character. Response after it is played: search the top 5 cards of your deck for Item attachments, one at a time, then shuffle. Action: exhaust it and the attached character to play an Item attachment from your hand on a legal target, its cost reduced by 1 (in any action window). |
| Axe of the Edain     | Restricted, +2 attack. Response after it is played: 2 damage to a non-unique enemy engaged with you.                                                                                                                                                                                                |
| Durin's Dagger       | +1 attack. It may be played from your discard pile (the discard pile's Play button, paid as printed).                                                                                                                                                                                               |
| Dwarf-Lord's Crown   | Attach to a hero. Action: exhaust it to give each ally sharing a Trait with the attached hero +1 willpower, attack and defense until the end of the phase.                                                                                                                                          |
| Glittering Lute      | Restricted, +2 willpower. Response after it is played: each player in turn order may discard a card from their hand to reduce their threat by 2.                                                                                                                                                    |
| Gondolin Shield      | Restricted, +1 defense and sentinel. Response, in the shadow window of an attack the attached character defends: exhaust it and spend 1 resource from a hero of its controller to cancel the shadow effect; the attacking enemy is dealt another shadow card, revealed in this attack.              |
| Helm of Heroes       | Restricted, +2 defense. Response after the attached character takes damage from an enemy's attack: 1 resource to any hero's pool.                                                                                                                                                                   |
| Jewels of Wilderland | +1 willpower. Action: exhaust it and discard a card from your hand to draw a card.                                                                                                                                                                                                                  |
| Masterwork Bow       | Restricted, +1 attack and ranged. Response after the attached character attacks and defeats an enemy: 1 progress on a location in the staging area.                                                                                                                                                 |

Treasures attached by a campaign card are not "played", so their "after you
play" Responses wait until a discovered copy is played from a deck.

## Later chapters

The Campaign Pool's encounter cards join every later encounter deck regardless
of encounter set, so a card A Growing Threat sets aside in one scenario must
resolve in the scenarios after it, which other scenario modules run. The three
Wilds of Rhovanion chapters share one module, so the cards chapters 1–3 add
resolve in each of them; the chapters from The Withered Heath on need the
earlier chapters' cards to resolve outside their own modules, which comes with
them.

## Verification

```sh
node --import tsx --test tests/ered-campaign.test.ts
npm run build
npm run test:browser-ered-campaign
```

`tests/ered-campaign.test.ts` (28 tests) covers the registered texts and
faces, the uniqueness corrections and the cards kept out of ordinary games;
the chapter order and the Haldan rule; the setup (Turayn for one player or a
chosen player of two, A Growing Threat); the campaign card's resources (unique
locations do not count) and the treasure look, its reload, the eligible
characters and the undiscovered treasures; each treasure's bonuses and
keywords; A Growing Threat's surge and set-aside card; the resolution (the
discovered treasure, the Campaign Pool's copies capped by the collection, the
Evil Creatures enemies, Turayn's two answers, the next chapter not yet
available); the Campaign Pool and deck assignments at a later setup; Turayn's
Response; Axe of the Edain, Glittering Lute and Anvil of Gundabad when played;
Anvil's discounted play, Dwarf-Lord's Crown and Jewels of Wilderland; Durin's
Dagger from the discard pile; Gondolin Shield, Helm of Heroes and Masterwork
Bow in combat; a look at fewer treasures; and malformed Campaign Logs. For
Lost in Mirkwood it covers the texts, Melanwar for the player, the Twilight
Hall search, its guarded treasure and its claim (and a claimed Anvil of
Gundabad's search), Melanwar's 1 or 3 progress, and the resolution (the
Spiders card in the Campaign Pool, both answers, the next chapter). For The
King's Quest it covers the texts, the setup (Isolde, The Threat to Wilderland's
3 resources, Dagnir's Spawn, Abandoned Ruin in the Caves deck, Haldan, the 3
removed treacheries), The Threat to Wilderland's threat and immunity (also for
a card revealed during the phase, and ending with the phase), Dagnir's Spawn's
X stats, its Dragon-only attachments and its shuffle, Isolde's willpower and
readying, Abandoned Ruin's guarded treasure, the resolution's two questions,
and the interlude's free hero changes.

The browser suite begins the campaign from the lobby, checks the campaign card
in the quest inspector, answers Turayn's Response, chooses a treasure from the
three looked at and attaches it, plays a discovered Durin's Dagger from the
discard pile through its button, records the resolution through the
end-of-game dialog (Turayn joins the Campaign Pool; the Campaign Log shows the
treasures and the Hill Troll), then continues: the interlude puts Turayn in the
deck; Lost in Mirkwood gives Melanwar, searches for Twilight Hall (the
inspector names its guarded treasure), resolves Melanwar's Response, claims the
treasure and records Melanwar's note; the interlude before The King's Quest
offers free hero changes; The King's Quest gives Isolde, resolves The Threat to
Wilderland's immunity (shown by the inspector) and Dagnir's Spawn's damage, and
records Isolde and Dagnir's Spawn in the Campaign Pool, after which The
Withered Heath is not available yet; at 1280, 390 and 320 pixels (60
checkpoints); it checks the 22 pinned faces.
