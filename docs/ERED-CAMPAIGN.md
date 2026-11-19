# The Ered Mithrin campaign

Campaign mode for the Ered Mithrin Campaign Expansion (2024, MEC115): its nine
scenarios are played in order with the Revised Core Set's Campaign Log, and
each campaign card, boon and burden changes the scenario it belongs to. Campaign
mode offers it as **Ered Mithrin**, next to Mirkwood Paths, The Lord of the
Rings, Angmar Awakened and Dream-chaser. The campaign begins with Journey Up
the Anduin; **its first eight chapters are supported** (Journey Up the
Anduin, Lost in Mirkwood, The King's Quest, The Withered Heath, Roam Across
Rhovanion, Fire in the Night, The Ghost of Framsburg and Mount Gundabad), and
the last chapter follows (The Fate of Wilderland is not available in campaign
mode yet).

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
  faces), and The Withered Heath's campaign card with its four Accolades and
  four Songs (9 cards, 10 faces) were checked the same way; all 28 cards and 32
  faces are pinned. The scans add "Permanent." to each Accolade.
- The scans correct the catalog: Turayn's text begins with "Sentinel." and A
  Growing Threat's with "Surge."; the treasures carry the TREASURE type line
  and the unique symbol. The second campaign card's title, printed in small
  capitals, is the scenario's "Lost in Mirkwood" (the catalog has "Lost In
  Mirkwood"). Dagnir's Spawn prints X threat and defense (X is the campaign
  card's part number). Their collector numbers (164–173 and 195–203) are one
  lower than the RingsDB codes, which the data keeps.
- Mount Gundabad's campaign card (both faces, "Ered Mithrin Part 8",
  collector number 192) and Dragon-sickness (193) were checked the same way;
  the scan adds "Surge." to Dragon-sickness. With them 39 cards and 47 faces
  are pinned.
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

## The Withered Heath (Part 4)

| Card                          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                 | Setup: a player may search their deck for a unique boon ally (the deck is shuffled); with "Melanwar has given you guidance", the first player removes 2 non-unique locations from the encounter deck and 1 location from the Caves deck; with "Isolde is on the hunt", 3 non-unique enemies. Abandoned Ruin, in the Campaign Pool, joins the Caves deck. Forced: after main quest stage 1, 2 or 3 is defeated, a player who does not control an Accolade may attach that stage's Accolade to one of their heroes; stage 4's defeat wins the game, so Dragon-slayer is offered with the resolution. Resolution: each Accolade in play joins the Campaign Pool, recorded with its hero; each player may add a different Song to the Campaign Pool; with 4 Dragon Signs in the victory display, the players choose 1 of 3 random undiscovered treasures, discovered at once; the treasures the players control are discovered. |
| Master of the Hunt (Accolade) | Permanent. +1 hit point. Response: after its hero commits to the quest, a chosen player looks at the top 3 cards of their deck, keeps 1 on top and puts the others on the bottom in the order they choose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unbroken (Accolade)           | Permanent. +1 defense. Action: discard a card from your hand to heal 1 damage from its hero (each player once each round).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The Steadfast (Accolade)      | Permanent. +1 willpower. Response: after its hero commits to the quest, with your threat at 40 or more, 1 progress on the current quest (always used: it only helps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Dragon-slayer (Accolade)      | Permanent. +1 attack. Response: after a non-unique enemy is added to the staging area, exhaust it to engage that enemy, which makes an immediate attack against you.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| The Canny Huntsman (Song)     | Quest Action: look at the top 5 encounter cards and put each on top (in the chosen order) or on the bottom; the Master of the Hunt hero gets +3 willpower this phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A Tale of Victories (Song)    | Combat Action: draw a card for each enemy engaged with you; the Unbroken hero heals 3 damage and cancels 3 of the next damage dealt to it this phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Lay of Courage (Song)         | Quest Response, offered when a card is revealed from the encounter deck in the quest phase: cancel its when-revealed effects; the Steadfast hero readies; Lay of Courage goes to the victory display.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Rhyme of the Slayer (Song)    | Combat Action: an enemy gets −4 attack this phase; the Dragon-slayer hero gets +4 attack while attacking it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The Accolades are Permanent, like the Revised Core's and Angmar Awakened's
Permanent boons: the Campaign Log records each with the hero that earned it, it
returns to that hero at each later setup, and it leaves the game (and the
Campaign Log) with that hero. The Songs join decks through the interlude.

## Roam Across Rhovanion (Part 5)

| Card                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                | Setup: a player may search their deck for a unique boon ally; with "Melanwar has given you guidance", the first player removes 3 non-unique enemies not named Grey Mountain Giant from the encounter deck. Once the scenario's setup gives the first player control of Urdug, they may put their trust in him (a resource on him from the token pool); if they don't, a copy of Urdug's Cunning is shuffled into the encounter deck. Forced: after the first player claims an objective (Urdug or Tiny under the players' control, Durin's Key attached to a hero, Urdug's Horn attached to Urdug; passing Urdug to a new first player is no claim), the same choice. Urdug, as an objective-ally or an enemy, gets +1 willpower, threat, attack and defense for each resource on him. The deep keyword is ignored (the scenario has no Caves deck). Resolution: with 3 or more resources on Urdug, each player adds a copy of Misplaced Trust to the Campaign Pool and their deck, otherwise a copy of Urdug's Cunning; each player chooses a location in the staging area (different titles, if able) and a copy joins the Campaign Pool (in the end-of-game dialog, skipped with no location there). |
| Urdug's Cunning (burden, ×4) | Doomed 1. Surge. When Revealed: the top 5 encounter cards are discarded, and for each enemy among them each player deals 1 damage to a character they control (1 at a time). Shadow: the attacking enemy gets +2 defense this phase. The trust choice can shuffle in only the copies left in the collection (4, less those in the Campaign Pool).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Misplaced Trust (burden, ×4) | Setup: shuffled into its player's deck after the starting hand (held out of a mulligan's new hand) in every later chapter. Forced: after its player draws it, they attach it to a hero they control: the hero's player card attachments are discarded (a Permanent Accolade stays), it cannot have player card attachments and it is immune to player card effects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Fire in the Night (Part 6)

| Card                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card             | Setup: the first player gains control of Beldis; with "Turayn has taken an oath of vigilance", the first player removes 3 non-unique locations from the encounter deck; with "Isolde is on the hunt", 3 non-unique enemies. The deep keyword is ignored (the scenario has no Caves deck). Resolution: Beldis joins the Campaign Pool or the Campaign Log notes that "Beldis's care has bolstered the heroes' spirits"; with at least 5 progress on Hrogar's Hill (the main quest) the players choose 1 of 3 random undiscovered treasures, discovered at once; the treasures the players control are discovered; each player may remove a non-burden encounter card from the Campaign Pool (1 copy each, never more copies than it holds; "Remove nothing" is the default, and the boons, whose removal never helps, are not offered). |
| Beldis (unique boon ally) | Action, which any player may trigger: spend 1 resource from a hero you control and mark one of your uses in the Campaign Log to heal 3 damage from a character (not one immune to player card effects). Each player has 4 uses for the campaign, shown in the Campaign Log's notes and the quest inspector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## The Ghost of Framsburg (Part 7)

| Card                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                   | Setup: each player may change heroes without the +1 threat penalty (the interlude says so); Ashen Brazier, Gundabad Hunter and Gundabad Stalker are shuffled into the encounter deck; a player may search their deck for a unique boon ally; with "Isolde is on the hunt" the first player removes 3 treacheries, with "Beldis's care has bolstered the heroes' spirits" 3 non-unique locations. The deep keyword is ignored (no Caves deck). Response: after Fram's Shade engages a player at stage 1 or 2, the players look at 3 random undiscovered treasures and attach 1 to it as a guarded objective, claimed when it leaves play (always used, once per game). Action, which any player may trigger from the quest inspector's campaign card panel (or the main quest card's ability): raise each player's threat by 1 to shuffle the encounter discard pile into the encounter deck. Resolution: the treasures the players control are discovered; Gundabad Hunter or Gundabad Stalker joins the Campaign Pool; the discard pile is shuffled in and cards are discarded until 2 Hazard cards are, and the group adds 1 of them to the Campaign Pool (a Gundabad burden as a burden, another card as a copy). |
| Ashen Brazier (boon objective)  | Loot: in this chapter the scenario module treats it as one of its Loot objectives (revealed, it is discarded and another card revealed; Discover and Forgotten Crypt can guard it; free, the first player attaches it to a hero; it counts for the stages and The Cursed Tomb). Action: exhaust it to look at a facedown shadow card (it stays facedown).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Gundabad Hunter (burden enemy)  | When Revealed: it makes an immediate attack against a player engaged with a unique enemy (the first player chooses among them; with none, among all players). Shadow: a unique attacker makes an additional attack.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Gundabad Stalker (burden enemy) | Cannot be optionally engaged except by a player engaged with a unique enemy. Shadow: a unique attacker returns to the staging area after the attack.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Mount Gundabad (Part 8)

| Card                               | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                      | Setup: with 6 or more treasures recorded in the Campaign Log, Dragon-sickness is shuffled into the encounter deck; a player may search their deck for a unique boon ally; with "Melanwar has given you guidance on traversing Wilderland" the first player removes 2 non-unique locations from the encounter deck and 1 location from the Caves deck, with "Beldis's care has bolstered the heroes' spirits" 3 treacheries (Abandoned Ruin joins the Caves deck from the Campaign Pool). The discover keyword is ignored (it is only The Ghost of Framsburg's). Unique locations cannot be discarded from play by encounter card effects: the encounter effect leaves them in play (Powerful in Wrath still surges), while player card effects may discard them. Resolution: the treasures the players control are discovered; the players may choose 1 of 3 random undiscovered treasures, discovered at once ("Take no treasure" is offered, and the question warns when a 6th treasure would add Dragon-sickness); A Growing Threat leaves the Campaign Pool; with 6 or more treasures recorded, Dragon-sickness joins the Campaign Pool (with every treasure discovered there is nothing to look at). |
| Dragon-sickness (burden treachery) | Surge. When Revealed: the first player attaches it to a character with 1 or more treasures attached, and every unguarded treasure in play moves to that character (Dwarf-Lord's Crown only to a hero; the Restricted limit then applies). With no such character it is discarded. As a Condition: after the attached character exhausts, its controller raises their threat by 1 for each treasure attached to it. It goes to the encounter discard pile when it leaves play.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

## The Campaign Pool across scenarios

The Campaign Pool's encounter cards join every later encounter deck regardless
of encounter set, so a card from one scenario must resolve in another scenario's
module. The three Wilds of Rhovanion chapters share one module, and the Core
Set's cards (the Evil Creatures enemies, the Spiders of Mirkwood and Dol Guldur
Orcs cards) resolve in every scenario. For the chapters from The Withered Heath
on, `src/game/ered-campaign-pool.ts` scripts the 78 cards of Journey Up the
Anduin, Lost in Mirkwood, The King's Quest, The Withered Heath, Roam Across
Rhovanion, Fire in the Night and The Ghost of Framsburg that can join the
Campaign Pool (the
non-unique, non-objective, non-burden cards A Growing Threat can set aside, and
Roam Across Rhovanion's staging locations): each later chapter's hooks are
composed with the pool's, which act only on a card foreign to that chapter
(outside its own recipes; 57, 61, 64, 63, 63 and 71 of them in chapters 4 to
9). Card text that refers to another scenario's components does as much as it
can:

- **The Evil Creatures deck** exists only in Journey Up the Anduin: Wooded
  Riverbank's explored effect and Frenzied Creature's When Revealed find nothing
  (Frenzied Creature's shadow still attaches it to the attacking enemy).
- **The Caves deck** exists in The Withered Heath and Mount Gundabad: there, the
  deep keyword of Deep Chasm, Dark Tunnel and Forked Passage and Contested
  Depths' replacement use the chapter's own Caves rule (The Withered Heath's
  stage 2 ignores the deep keyword); Forked Passage's Response orders the top
  two cards first, then joins the victory display. Elsewhere Contested Depths
  can only raise threat, and Forked Passage's Response is not offered.
- **Guarded cards**: Hobgoblin guards the first player's top card faceup (+X
  from its cost) and returns it to its owner's hand when it leaves play; Mirkwood
  Patrol guards an unguarded objective-location; Unseen Danger's shadow counts a
  card guarded in any of the scenarios' ways.
- **Dragon Signs** are only The Withered Heath's: elsewhere Dragon Hatchling
  and Cave Entrance count none in the victory display, and Creature Den's
  Response finds none to guard (its Travel cost still adds the first enemy
  discarded from the reshuffled encounter deck). Snow-troll, Mountain Pass,
  Dwarven Door, High Falls, Heavy Snow and Deadly Cold keep their printed rules;
  Dwarven Door, Cave Entrance and High Falls use Mount Gundabad's Caves deck for
  the deep keyword.
- **Urdug** is only Roam Across Rhovanion's: elsewhere Sneaking Off adds 5
  to the staging area's threat until the end of the phase (and is removed from
  the game), Deep Ravine's Travel cost raises each player's threat by 2, and
  Slopes of Ered Mithrin's shadow does nothing. Grey Mountain Giant, Hunting
  Eagle, Wilderland Bear, Grey Moorland, Harsh Weather and Wild Creatures keep
  their printed rules (Wild Creatures offers only enemies the chapter lets a
  player engage, so not Fire in the Night's Dagnir).
- **Hrogar's Hill and Dagnir** are only Fire in the Night's: elsewhere The
  Dragon's Thrall attacks the player it engages, Orc of the Flame makes the
  first player deal 2 damage to a hero, Town Gate gains a resource at the end
  of each quest phase and is discarded at 3, Powerful in Wrath discards the
  active location and surges, and The Dragon's Fury and Town Gate's Travel find
  no Dagnir; Wooden Palisade readies a hero, Burning Watchtower and Bright
  Flames count the side quests in the victory display.
- **Discover and Loot** are only The Ghost of Framsburg's, and Mount
  Gundabad's and The Fate of Wilderland's campaign cards ignore the discover
  keyword: Hidden Staircase's Forced never triggers, Abandoned Ruins always
  gains surge and doomed 2 (each player raises their threat by 2), and
  Forgotten Crypt (immune to player card effects) adds the first Undead enemy
  discarded to the staging area and finds no Loot objective to guard. Crypt
  Stalker (X from the first player's threat), Evil Spectre (shuffled back when
  destroyed at a Dark active location), Haunted Hall, Moonlit Passage, Cursed
  Tower, Terrible Shadows and Slammed Shut keep their printed rules.
- Lonely Lands keeps events played during the quest phase facedown under it
  (+2 threat each) and discards them when it leaves play; Lost in the Wild sits in
  a hand; the conditions (Weighed Down, Afraid of the Dark, Dragon Breath,
  Dragon Scales, Frenzied Creature) and lasting effects (Vastness of Mirkwood,
  Dark Places, Giant Spider, Black Bats, Dark Black Woods' progress limit) are
  saved with the game.

"Resolve the 'when revealed' effect" of a discarded treachery (Lightless Grotto,
Grey Moorland) now resolves a card no scenario module replays (a Core Set card
or a burden from the Campaign Pool) through the ordinary encounter scripts,
where it used to stop the game or lose the card. The cards of the later chapters
become portable with their chapters.

## Verification

```sh
node --import tsx --test tests/ered-campaign.test.ts tests/ered-campaign-pool.test.ts tests/ered-campaign-heath.test.ts tests/ered-campaign-roam.test.ts tests/ered-campaign-fire.test.ts tests/ered-campaign-ghost.test.ts tests/ered-campaign-gundabad.test.ts
npm run build
npm run test:browser-ered-campaign
```

`tests/ered-campaign-heath.test.ts` (8 tests) covers The Withered Heath's
texts, its setup (the Accolades back on their heroes, the boon ally search,
both notes' removals, Abandoned Ruin in the Caves deck), the Accolade after a
defeated stage (and none for a player who has one), the resolution (the
Accolades, Dragon-slayer, the Songs, different Songs in a two-player game, the
treasure with 4 Dragon Signs), and each Accolade and Song.

`tests/ered-campaign-roam.test.ts` (8 tests) covers Roam Across Rhovanion's
texts and faces, its setup (Melanwar's removals sparing the Grey Mountain
Giants, the trust offered once the first player controls Urdug), Urdug's stats
from his resources (also as an enemy, and none outside the campaign), declining
the trust and the 4 copies of Urdug's Cunning, the trust offered after each
claimed objective (Tiny, Durin's Key, Urdug's Horn, Urdug after Sneaking Off)
but not when Urdug passes to another player, Urdug's Cunning's reveal (Doomed,
surge, discards and damage) and shadow, Misplaced Trust (after the starting
hand, out of a mulligan, attached when drawn, its discards, restriction and
immunity), and the resolution (Misplaced Trust or Urdug's Cunning, the staging
location, different locations for two players when able, no question without
a location, Misplaced Trust in a deck of the next chapter).

`tests/ered-campaign-fire.test.ts` (5 tests) covers Fire in the Night's texts
and faces, its setup (Beldis for the first player of one or two, Turayn's and
Isolde's removals), Beldis's Action (its cost, the use marked, a target immune
to player card effects, the 4 uses, another player triggering it), and the
resolution (Beldis or the note, the treasure at 5 progress and none below, the
removals, a burden never offered, two players and the copies held, the next
chapter).

`tests/ered-campaign-ghost.test.ts` (7 tests) covers The Ghost of Framsburg's
texts and faces, its setup (the three cards shuffled in, the boon ally search,
Isolde's and Beldis's removals), Ashen Brazier as a Loot objective (discarded
and replaced when revealed, claimed when its guard leaves, counted as a Loot
objective, its Action), Gundabad Hunter's attack (one player, the player
engaged with a unique enemy, the first player's choice), Gundabad Stalker's
engagement limit, both shadows, Fram's Shade's treasure (once, not at stage
3), the campaign card's Action (an empty discard pile, another player), and
the resolution (the burden, the 2 Hazard cards, the next chapter).

`tests/ered-campaign-gundabad.test.ts` (5 tests) covers Mount Gundabad's texts
and faces, its setup (Dragon-sickness at 6 treasures and not at 5, Melanwar's
removals with the Caves deck's, Beldis's removals, Abandoned Ruin in the Caves
deck, the inspector's line), the protected unique locations (Powerful in Wrath
leaves Throat of the Mountain and surges, a non-unique location is discarded,
player card effects and games outside the campaign are unaffected),
Dragon-sickness (discarded without a treasure in play, the treasures gathered
on an ally with Dwarf-Lord's Crown staying on its hero, the threat when the
attached character exhausts, the discard pile when it leaves play, the
controller's threat in a two-player game), and the resolution (the optional
treasure, A Growing Threat removed, Dragon-sickness at a 6th treasure and not
without it, a controlled treasure discovered first, nothing to look at with
every treasure discovered, the next chapter not yet available).

`tests/ered-campaign-pool.test.ts` (27 tests) covers the foreign cards of each
later chapter (each one revealed in each chapter where it is foreign, with a
valid save), their passive values, triggers, shadows and choices, the Caves
deck through The Withered Heath, the Lost Caves locations and The Withered
Heath's nine cards in Roam Across Rhovanion, Roam Across Rhovanion's nine cards
in Fire in the Night, Fire in the Night's eight cards in The Ghost of Framsburg,
The Ghost of Framsburg's ten cards in Mount Gundabad (the discover keyword
ignored), the When Revealed fallback, and a two-player game.

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
records Isolde and Dagnir's Spawn in the Campaign Pool; The Withered Heath
shows its Dragon Signs in the inspector, attaches Master of the Hunt after the
first stage and records it with Lay of Courage; Roam Across Rhovanion offers
the trust in Urdug at setup and again when Tiny is claimed (declined: Urdug's
Cunning is shuffled in), shows Urdug's resources in the inspector, and records
Misplaced Trust and a staging location; Fire in the Night gives Beldis, uses her
Action through its button (a use marked in the Campaign Log), and records
Beldis, a treasure for 5 progress and a removal from the Campaign Pool; The
Ghost of Framsburg offers free hero changes, shuffles in its three cards, uses
the campaign card's Action from the quest inspector and records Gundabad
Stalker and a Hazard card; Mount Gundabad puts Abandoned Ruin in the Caves
deck, shows its campaign card's rules in the inspector, attaches
Dragon-sickness to a hero with the treasures gathered on it (its exhaustion
raises the threat by 2) and records a treasure from the resolution, after
which The Fate of Wilderland is not available yet; at 1280, 390 and 320 pixels
(123 checkpoints); it checks the 47 pinned faces.
