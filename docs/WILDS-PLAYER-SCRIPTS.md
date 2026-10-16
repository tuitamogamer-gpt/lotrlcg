# The Wilds of Rhovanion original player cards

The fifteen original designs `18001`–`18015` retain the exact immutable catalog
records in `src/data/wilds-rhovanion-player-cards.json`. All original scans were
read directly in `output/batch4-release/players-sheet-5.jpg` through
`players-sheet-7.jpg`; original image hashes are pinned by
`output/batch4-release/player-art-pins.json`. Bartering's printed final sentence
reads “where X is the chosen attachment's cost”; the catalog's missing X remains
unchanged in its source snapshot.

`wilds-player-support.ts` supplies current Dale equipment bonuses, Sentry and
Warrior attachment discounts and keywords, Lookout quest exhaustion, Bard's
conditional Item resource icons, Necklace's resource bonus, and temporary
King of Dale/Bartering/Valour modifiers. Hauberk keeps its existing printed
attachment restriction, defense bonus and Sentinel health integration.

`wilds-player.ts` supplies native physical-card actions and optional responses:

- Brand's draw is offered only after an attachment is played on a Dale
  character that previously had no attachment. Moving an Item does not replay it.
- Bard saves each physical player attachment to its owner's hand when a
  character leaves. Each Bard's once-per-phase response survives suspended
  choices and reloads; declining discards those same attachments.
- Long Lake Trader exhausts before the physical Item and eligible new host are
  chosen. Attachment restrictions and ownership remain in effect after moving.
- King of Dale counts different player attachment titles, including itself,
  when exhausted. Its next Dale ally discount and resource-match waiver expire
  after that play or the planning phase. Bartering returns a ready attachment
  as its event cost; a canceled event grants no discount.
- Bow of Yew exhausts the selected copy before dealing its optional damage.
  Map of Rhovanion places optional progress on an active location. Valour of
  the North applies only to the resolving attack and requires an attached enemy.
- Traffic from Dale counts characters with player attachments once each and
  enforces both Planning and the once-per-round play limit. To Arms! can ready
  another player's eligible equipped ally.
- Necklace of Girion uses the original Guarded (X) rules on page 2 of
  [MEC65](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec65_web_the-wilds-of_rhovanion_rules.pdf):
  discard until an enemy or location is found, add that card without revealing
  it, and attach the Necklace as a guarded objective. When the guard leaves,
  its owner chooses an eligible hero and attaches the same physical Necklace.

`tests/wilds-player.test.ts` covers all fifteen designs, native plays and
abilities, optional choices, physical identity and ownership, equipment losing
its host, phase/round limits, Guarded entry without When Revealed effects, and
save/reload between each action. `wildsPlayerBrowserCases()` in the matching
fixture file supplies unplayed Brand, Trader, King, Necklace and Traffic scenes
for aggregate browser verification.
