# The Dream-chaser campaign

Campaign mode for the nine scenarios of The Grey Havens and the Dream-chaser
cycle, with the Dream-chaser Campaign Expansion's campaign cards, boons,
burdens, Upgraded faces and its new rules: experience (XP), scalable and
upgradable cards, a fleet of six ships and the Hard/Expert Mode card. The
lobby's campaign mode offers it as the fourth campaign, for one fellowship of
one to four local players. Its first two chapters, Voyage Across Belegaer and
The Fate of Númenor, are supported; the Campaign Log is kept after them, and the
end of the game says that the next chapter, Raid on the Grey Havens, is not
available in campaign mode yet.

## Sources

- The campaign rules are the Revised Core Set's (Learn to Play, pages 30–31):
  the Campaign Log, fallen heroes, the +1 threat penalty for each replaced
  hero and the Campaign Pool. The expansion's rulebook (MEC111, "Dream-chaser
  Campaign Rules", page 29) adds XP, scalable and upgradable cards, the
  encounter-card status of the fleet's campaign cards, the Na'asiyah rule and
  the Hard/Expert Mode card; its Campaign Log (page 31) prints the checkboxes
  of the 14 scalable and 28 upgradable cards.
- The 60 cards of the expansion that differ from the original cycle (98 faces
  with their backs) were checked by eye against the DragnCards scans and
  transcribed from the official print-and-play file of the campaign cards
  (`mec111_dreamchaser_campaign_cards_web.pdf`). That file also holds three
  faces the expansion prints on the backs of original cards: The Havens Burn
  and the Dream-chaser location (both Upgraded) and the Stormcaller of The
  City of Corsairs ("Campaign Mode only"); their art is rendered from it. The
  cards are added to `src/data/dreamchaser-campaign-cards.json` and their faces
  pinned in `tests/dreamchaser-campaign-art.json` chapter by chapter, with
  their scripts. An Upgraded or "Campaign Mode only" side has its own card code
  (the front's code with `.B`).
- The scans correct the catalog: Ominous Fate has "Surge. Ominous Fate cannot
  be canceled.", a Shadow effect and a sailing success symbol; Thunderstruck
  is a ship-enemy with Archery 1, Boarding 2 and immunity; Revenant and Graxar
  are immune to player card effects (Graxar also limits his attackers); The
  Black Sword's front enters play with 3 resources.

## The campaign rules

- **Chapters**: the nine scenarios are played in order, beginning with Voyage
  Across Belegaer; the players advance only after defeating the current
  scenario, and a lost chapter is replayed with the same log (and the same
  Hard/Expert Mode card).
- **The fellowship**: each player's heroes are recorded at the start; fallen
  heroes and replacements follow the Revised Core rules, as in the other
  campaigns. The Na'asiyah hero cannot be used in scenarios 1 through 7.
- **XP**: each campaign card's resolution lists conditions; the players gain
  the XP of the conditions met (the end-of-game journal records it with the
  chapter, and the quest inspector's campaign card shows the running total
  during the game). Unspent XP is recorded.
- **Spending XP**: in the interlude before each chapter, 1 XP marks one
  checkbox of the Campaign Log. Marked checkboxes stay marked. A scalable
  card's level is its number of marked checkboxes (its X grows with it); an
  upgradable card takes its Upgraded side once all of its checkboxes are
  marked. Gavin's 4 checkboxes are marked only with A Storm on Cobas Haven's
  resolution, to record "Gavin returned".
- **Hard/Expert Mode**: the lobby (for the first chapter) and the interlude
  offer the card for the next chapter. Hard Mode: each player's threat cannot
  be reduced by more than 1 each round, and after a player draws any number of
  cards (after setup) they raise their threat by that number; 1 XP if the
  players win. Expert Mode: threat cannot be reduced, the same draw rule, and
  a character healed or readied by a player card effect raises its
  controller's threat by 1; 2 XP if the players win.
- **The fleet**: when a sailing scenario prepares the fleet, each player takes
  one of six ships (the Dream-chaser, Dawn Star, Duskbringer, Glórinaith,
  Nárelenya and Silver Wing); one must be the Dream-chaser and a solo player
  takes it and one other. A ship whose checkboxes are all marked is prepared on
  its Upgraded side. The four original ships keep their scripts; the campaign
  adds Duskbringer (a resource after a card with an odd printed cost, once per
  round, twice Upgraded) and Glórinaith (discard the top cards of a deck to
  damage a non-unique enemy, once per round; the Upgraded side names a card).
  The Upgraded Dream-chaser counts as 3 characters in a Sailing test, the
  Upgraded Silver Wing lowers its controller's starting threat by 6, the
  Upgraded Dawn Star does not raise it, and the Upgraded Nárelenya reduces the
  first card of any type each round.
- **The Campaign Pool** keeps the earned boons and burdens: Ominous Fate joins
  it after Voyage Across Belegaer and is shuffled into each later encounter
  deck. Player-card boons join the deck the interlude assigns them to.

## Voyage Across Belegaer (Part 1)

| Card                                        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign card                               | Setup: once the fleet is prepared, each player chooses a different Modification boon for each of their ship-objectives (in turn order), then may deal 2 damage to each of their ships to add 1 resource to a hero; Ominous Fate and Thunderstruck are shuffled into the encounter deck and Crowley into the Corsair deck. Resolution: Ominous Fate joins the Campaign Pool, and the XP of the eight bullets (and the Hard/Expert Mode card) is gained. |
| Armor Plating (boon, Modification)          | Attached Ship gets +1 defense. Upgraded: after it defends against an enemy, discard 1 shadow card from another enemy.                                                                                                                                                                                                                                                                                                                                  |
| Ballista (boon, Modification)               | Attached Ship gets +1 attack. Upgraded: it gains ranged, and after it attacks, deal 1 damage to a non-unique enemy and remove 1 resource from it.                                                                                                                                                                                                                                                                                                      |
| Enlarged Quarters (boon, Modification)      | Attached Ship gets +3 hit points and can be committed to any Sailing test. Upgraded: it counts as 1 additional character there.                                                                                                                                                                                                                                                                                                                        |
| Extra Sails (boon, Modification)            | Attached Ship gets +1 willpower. Upgraded: when a non-unique Ship enemy engages its player, spend 1 resource and exhaust Extra Sails to reduce that enemy's Boarding value by 1.                                                                                                                                                                                                                                                                       |
| Ominous Fate (burden treachery)             | Surge; cannot be canceled. Each player reveals an encounter card, raises their threat by X or deals X damage among their characters (X is the part number, plus this game's additions); the players may then add it to the victory display (1 XP less). Shadow: reveal an encounter card.                                                                                                                                                              |
| Thunderstruck (burden ship-enemy)           | Archery 1, Boarding 2, immune; +2 hit points per player; at most 4 damage each round. Shadow: either it joins the staging area or the defending character takes 2 damage. Victory 7.                                                                                                                                                                                                                                                                   |
| Crowley (burden enemy, in the Corsair deck) | +1 threat, attack, defense and hit points for each resource on him; a resource each time he engages; he returns to the staging area at the end of the combat phase; with 3 or more resources he goes to the victory display for 3 points (otherwise to the Corsair discard pile).                                                                                                                                                                      |
| A Modification boon leaving play            | It is removed from the game.                                                                                                                                                                                                                                                                                                                                                                                                                           |

## The Fate of Númenor (Part 2)

The rulebook's campaign setup adds Spyglass, Revenant and every card in the
Campaign Pool (Ominous Fate, its X now 2).

| Card                                                   | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campaign card                                          | Setup, after the scenario's (once Calphon is in play): Spyglass is attached to Calphon, Revenant and Ominous Fate are shuffled into the encounter deck, and each player in turn order may deal 1 damage to any of their characters (each once) to reduce their threat by 1 per character (the Hard/Expert Mode limits still apply). Resolution: the XP of 1 per surviving player, 1 per Lush Jungle and Drowned Graves in the victory display, 1 per resource on the campaign card (at most 3), 1 if each surviving player's threat is 40 or less, −1 for Ominous Fate in the victory display (and the Hard/Expert Mode card). |
| Calphon (Upgraded, "Campaign Mode only", 2 checkboxes) | 2 willpower, 1 attack, 2 defense, 4 hit points; his Action looks at the bottom 5 cards of his controller's deck and may switch one of them with a card in hand (the hand card takes its place). He still follows the first player, and the game is lost if he leaves play.                                                                                                                                                                                                                                                                                                                                                     |
| Spyglass (boon attachment on Calphon)                  | Action, exhausting it, for Calphon's controller: look at a facedown shadow card (a private dialog; it stays facedown), look at the top and bottom card of your deck, or place 1 progress on a location (2 on an Uncharted Lost Island). Upgraded (3 checkboxes): the shadow card may be discarded, any player deck or the encounter deck may be looked at, and an Uncharted location takes 4 progress. Leaving play, it is removed from the game.                                                                                                                                                                              |
| Revenant (burden enemy)                                | Immune to player card effects; +2 attack and +2 defense for each resource on the campaign card; 3 or more damage placed on it becomes 2; destroyed, it is shuffled back into the encounter deck and 1 resource is placed on the campaign card (the quest inspector's campaign card shows the count).                                                                                                                                                                                                                                                                                                                           |

## Not supported yet

Raid on the Grey Havens through The City of Corsairs follow, with their boons
and burdens (Black Key, Galdor's Counsel, Graxar, Parrying Cutlass and Throwing
Axe, Calaerion, Come Together, Sea Serpent, Starla, Recurring Nightmare,
Command, Círdan's Blessing, Gavin, Send for Help and The Black Sword) and the
"Campaign Mode only" sides of their scenario cards.

## Verification

```sh
node --import tsx --test tests/dreamchaser-campaign.test.ts
npm run build
npm run test:browser-dreamchaser-campaign
```

`tests/dreamchaser-campaign.test.ts` (15 tests) covers the registered cards'
texts and faces, the Campaign Log's checkboxes, the chapter order and the
Na'asiyah rule; Voyage Across Belegaer's fleet of six ships, the Modification
choices and the damage-for-resource offer; Upgraded ships and Modifications
from marked checkboxes (with the Sailing count and starting threats); Ominous
Fate's choices, cancellation and victory display; Thunderstruck's hit points,
archery, damage limit and shadow; Crowley's engagement, return and victory;
Duskbringer and Glórinaith; the Upgraded Modification boons' Responses and
their removal from the game; Hard and Expert Mode; the resolution's XP, the
pooled Ominous Fate, spending XP and its checks, saves, and a two-player
fleet; The Fate of Númenor's cards, its setup (Spyglass on Calphon, Revenant
and Ominous Fate shuffled in, the damage-for-threat offers), the Upgraded
Calphon's bottom-5 switch and his loss condition, Spyglass's three choices on
both sides through the table's ability controls, Revenant's immunity,
bonuses, damage limit and return with a resource, and the resolution's XP
lines before the next chapter is refused. The browser suite starts a new
Dream-chaser campaign through the lobby on Hard Mode, prepares the fleet with
two Modification boons, opens the campaign card's state in the quest
inspector and records the resolution; the interlude spends 2 XP on Calphon's
checkboxes, The Fate of Númenor begins with the Upgraded Calphon, Spyglass and
Revenant and one hero's damage for threat, Spyglass places 2 progress on a
Lost Island through its button, and the second resolution is recorded, at
1280, 390 and 320 pixels (18 checkpoints); it checks the 34 pinned faces.
