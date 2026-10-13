# Original Temple of the Deceived rule contract

This contract transcribes the original MEC50 insert and cached original card
faces checked on 13 October 2026. [TEMPLE-SOURCES.md](TEMPLE-SOURCES.md) records
their identities, hashes, recipes and printed corrections. It describes the
original standard/easy adventure, without revised campaign or Nightmare rules.

## Setup and the Island Map

Prepare all fifteen double-sided Uncharted locations in a fixed **three-row,
five-column** grid without looking at their facedown sides. The first four
columns contain twelve Lost Island fronts; the rightmost column contains three
Temple of the Deceived fronts. Shuffle each group before placing it. Directions
refer to the printed diagram: right is toward the Temple column.

Searching the Island 1A instructs the players to flip the upper-left and
lower-left locations **without resolving their Forced effects**, then choose
one as the starting active location. The first player controls Captain Sahír
and the last player controls Na'asiyah, with their objective-ally sides faceup.
Put Temple Guardian into staging with Gate Key attached to it, guarded, and
shuffle the encounter deck. The quest's B side has **Exploration**, a printed
quest-point dash, and this replacement: for each progress that would be placed
on Searching the Island, the players may place it on a location in staging
instead.

The Island Map is separate from staging. Locations never leave the map or
change their positions for any reason; an effect that would swap two locations
does not work. The active marker moves while the physical locations remain
fixed. Only **orthogonally adjacent** locations count as staging, subject to
the printed Jagged Cliffs/Jungle Path exceptions. Diagonals do not count.
Other map locations remain in play outside staging. Enemies and other ordinary
staging cards still use the separate staging area.

Successful questing places progress on the active location first, up to its
quest points, before progress would reach the quest. Reaching a location's
quest points does **not** immediately explore or discard it. During travel,
the players may leave the active location only after it has enough progress,
and normally travel to an adjacent staging location. Clear **all** progress
from the location they leave. It then counts as explored, remains in its fixed
position and stays on its revealed side. Move the active marker to the new
location and resolve its appropriate printed effects. Flipping an Uncharted
location also clears all of its progress. There is always an active location;
previously explored locations may be revisited.

## Shared fronts, the Key and victory

- **Lost Island:** threat 2, printed quest-point dash, Uncharted, cannot have
  player-card attachments. Its Forced effect flips it after it becomes active.
  Its Action removes four progress from that Lost Island to look at its
  facedown side. Looking neither flips it nor triggers its reveal-side Forced.
- **Temple of the Deceived:** threat 4, printed quest-point dash, Ruins,
  Uncharted, immune to player-card effects. Travel requires exhausting Gate
  Key. Its Forced effect flips it after it becomes active.
- **Gate Key:** unique Item/Artifact. If unattached, it returns to staging and
  gains the Action to exhaust a hero, claim the Key and attach it to that hero.
  Its other Action exhausts both Key and attached hero, and spends three
  resources from that hero's pool, to look at the facedown side of a Temple.
  Paying a Temple's Travel cost exhausts only the Key. The attachment and hero
  have separate ready/exhaust states (FAQ 1.12).
- **Temple Guardian:** unique Undead, threat X equal to player count,
  engagement 50, attack 6, defense 4, ten hit points and Victory 4. It is immune
  to player-card effects and cannot be optionally engaged. Cursed Temple being
  active reduces its engagement cost by 50. It has no Indestructible keyword.
  Its destruction frees the same guarded Key and puts the Guardian into the
  victory display; later printed location effects may return it.
- **The Grotto's Entrance:** unique Ruins, threat 2, eight quest points. When
  flipped while active, its Forced effect puts Temple Guardian into play from
  the victory display, engaged with the highest-threat player. Placing the
  **eighth progress** on the grotto wins. The revealed grotto has no immunity,
  unlike its unrevealed Temple front; its printed win clause does not require
  it to be active. Legal player-card progress can therefore reach that win.

No “Hunt for the Guardian” side quest or keyword is printed in the original
recipe, insert or quest. Peeks reveal information to their entitled viewer
without turning the physical card into a public revealed location.

## Revealed locations

The two shared front texts above apply to every applicable physical card.
Printed threat and quest points below describe the revealed side.

| Location              | Threat / quest points | Complete revealed-side rules                                                                                                                                                                                            |
| --------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jagged Cliffs         | 4 / 4                 | While active, the location to its right is not staging. When flipped while active, look at each adjacent Lost Island's facedown side. This means geometric adjacency, including a right neighbor excluded from staging. |
| Winding Caverns       | 2 / 6                 | While active, every enemy gets +10 engagement cost. When travelling from it, the players may travel up to three locations away, still paying the destination's Travel cost.                                             |
| Jungle Path           | 3 / 3                 | While active, the locations immediately above and below are not staging. When flipped while active, each player exhausts a character with at least 2 attack.                                                            |
| Temple Halls          | 5 / 5                 | While active, every character gets -1 attack and -1 defense. When flipped while active, put the Guardian into play from victory, engaged with the highest-threat player.                                                |
| Cursed Temple         | 1 / 3                 | While active, characters with less than 2 willpower do not ready during refresh. This uses their applicable current willpower.                                                                                          |
| Drowned Graves        | 2 / 2                 | After flipped while active, discard the top X encounter cards, X = player count +2. Each player adds an Undead enemy discarded this way to staging.                                                                     |
| Flooded Ruins         | 3 / 5                 | While active, it contributes its threat to staging.                                                                                                                                                                     |
| The Grotto's Entrance | 2 / 8                 | Return the Guardian when flipped while active; win on the eighth progress, as described above. No revealed-side immunity.                                                                                               |

## Encounter enemies and shadow effects

Stats are engagement / threat / attack / defense / hit points. All listed
enemies other than the companions are Undead. The companions' enemy faces
remain source references; setup uses their objective-ally reverse faces.

| Enemy                 | Stats               | Complete non-stat rules and shadows                                                                                                                                                                           |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profane Dead          | 35 / 1 / 2 / 3 / 3  | When travelling right, it immediately attacks its engaged player. Shadow: +3 attack if the players control Gate Key. A Key guarded by the enemy is not player-controlled.                                     |
| Faithless Desecrator  | 25 / 2 / 2 / 2 / 4  | While engaged, its threat still contributes to staging. Shadow: +1 attack, or +2 instead if the active location is Ruins.                                                                                     |
| Island Watcher        | 46 / 3 / 4 / 1 / 5  | Cannot optionally engage. While staging, beginning encounter phase with active Ruins makes it engage the highest-threat player; then deal it two shadow cards. These do not replace the normal combat shadow. |
| Throngs of Unfaithful | 26 / 1 / 2 / 0 / 4  | Surge. When destroyed, discard the engaged player's bottom deck card; if printed cost ≤2, return Throngs to the encounter deck's top.                                                                         |
| Soulless Cadaver      | 38 / 3 / 3 / 2 / 4  | Engaged player's deck cannot be searched. When it engages, put each hand card of printed cost ≤2 on that player's deck bottom.                                                                                |
| Drowned Dead          | 32 / 2 / 4 / 3 / 3  | After an attack destroys an ally, put that ally on its owner's deck bottom. Shadow: an ally destroyed by this attack goes to its owner's deck bottom.                                                         |
| Temple Guardian       | 50 / X / 6 / 4 / 10 | Unique, Victory 4, immune, no optional engagement; active Cursed Temple gives -50 engagement cost. X = players.                                                                                               |

## Treacheries

| Treachery               | Complete reveal, keyword and shadow clauses                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deeper into the Ruins   | Until phase end, add X threat to staging, X = total threat of **all** locations left of the active location in its row. This includes nonadjacent locations outside staging and uses their applicable threat. If X is zero, it gains Doomed 1. Four physical copies. |
| Furious Rainstorm       | Each player chooses to raise their threat by the number of their committed characters, or deal one damage to each of those characters. Shadow: if this attack destroys a character, raise the attacked player's threat by the attacking enemy's threat.              |
| Dwindling Supplies      | Each player randomly discards hand cards until at most three remain. If the effect discards no cards across the group, it gains Doomed 2. Shadow: defending character gets -2 defense for this attack.                                                               |
| Sunken Ruins            | Doomed 1. Staging Uncharted locations gain +1 threat until phase end. If active location is Ruins, discard one resource from each hero and objective ally in play.                                                                                                   |
| Aimless Wandering       | The group removes questing characters with total willpower at least X, X = number of staging Uncharted locations. The first player may give it Doomed 2 to look at one staging Uncharted location's facedown side.                                                   |
| Curse of the Downfallen | Deal one damage to each non-objective ally with printed cost ≤2; allies destroyed this way go to their owners' deck bottoms. Shadow: discard the attacked player's bottom deck card; if printed cost ≤2, the enemy makes another attack after this one.              |

## Objective companions

Captain Sahír and Na'asiyah use the same physical identities as their original
double-sided Stormcaller Elite cards. Their objective-ally aliases do not add
new cards or duplicate physical IDs.

- **Captain Sahír:** unique Corsair/Raider, 0 willpower, 0 attack, 2 defense,
  five hit points. The first player gains control. Every resource on him grants
  +1 willpower and +1 attack, capped at +6. His Action spends one resource from
  a hero the controlling player controls to add one resource to Captain,
  once per round. If he leaves play, the players lose.
- **Na'asiyah:** unique Corsair/Raider, 1 willpower, 2 attack, 2 defense, four
  hit points. The last player gains control. While attacking or defending, her
  Action spends one of her resources for +2 attack **or** defense during that
  attack. Her other Action spends one resource from a hero the controlling
  player controls to add a resource to her, once per round. If she leaves play,
  the players lose.

## Player printed clauses

These clauses include the catalog's current marked errata where explicitly
stated. The original images and errata evidence are distinguished in the
source notes; original artwork is never redrawn to show corrected text.

| Design                | Rule contract                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elfhelm               | Each hero with a Mount attachment gains +1 willpower with Spirit, +1 attack with Tactics, and +1 defense with Leadership. Applicable resource icons can grant multiple bonuses.                                                                                              |
| Ceorl                 | Action: spend one Spirit resource to ready him; then you may give control of him to another player. Any player may trigger it; once per phase. Ready-before-transfer and the physical limit remain attached to the same card.                                                |
| Armored Destrier      | Restricted Mount; attach to a Leadership **or sentinel** hero. After attached hero defends, exhaust the Mount to ready the hero, then discard a shadow card from another enemy engaged with the defending player.                                                            |
| Déorwine              | Sentinel. Current erratum grants the defending-only Response: spend one Leadership resource to cancel a shadow effect just triggered. Any player may pay/trigger. Original #60 scan prints an Action; source notes state the limitation of the surviving errata attribution. |
| Revealed in Wrath     | Requires a Noldor hero. Action: choose a non-unique enemy; treat its printed text box as blank, except Traits, until phase end.                                                                                                                                              |
| Rhovanion Outrider    | After committing to quest, place one progress on a staging location. If it was not explored, it gets +1 willpower until phase end. Merely reaching quest points does not explore a Temple map location.                                                                      |
| Scouting Party        | After committing characters, if every character you committed is a Scout, each gets +2 willpower until phase end. It checks the triggering player's committed fellowship.                                                                                                    |
| Entangling Nets       | Play unattached into staging. If unattached, attach it to the next eligible enemy entering staging. Attached enemy gets -2 attack and -2 defense.                                                                                                                            |
| Arrows from the Trees | Play only after engagement checks. Encounter Action: if no enemies engaged this phase, deal one damage to each staging enemy; the group may spend three Tactics resources for two additional damage to each staging enemy.                                                   |
| Ered Luin Miner       | Response to being discarded from your deck: put that same physical ally into play. The current reprint deletes the original “top of” restriction, as proved by the #8 ©2022 scan.                                                                                            |

This document records source contracts, rather than claiming a completed test
run. Final semantic, save/restore, multiplayer, browser and release evidence
belongs to [TEMPLE.md](TEMPLE.md).
