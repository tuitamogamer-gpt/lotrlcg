# Beneath the Sands player cards

The original pack contains ten player designs (`17055`–`17064`), 28 physical cards. The immutable import in `src/data/beneath-sands-player-cards.json` matches the upstream catalog. Runtime corrections are recorded in `BENEATH-SANDS-SOURCES.md` and follow the original card faces: Haradrim Spear attaches to **Harad**, Keep Watch has 6 quest points and Victory 1, The Red Arrow has Victory 1, Rider's printed “exhaust” spelling is restored, and Dúnedain Lookout's title is accented.

Four designs already had actual native scripts and retain them:

- **Hirgon:** the successful-quest window offers a physical Tactics ally in its controller's hand. The saved payment chain spends matching hero resources with the discount, enters the ally as played, and offers the optional threat cost and round attack/defense bonus.
- **The Red Arrow:** a committed attached hero must quest successfully while its controller is in Valour. The response moves the actual attachment into victory, searches only the top five physical deck positions for an ally, and shuffles the remaining deck.
- **Fireside Song:** Hobbit-hero attachment restrictions, the per-hero limit, and active Song counting use the existing attachment and stat rules.
- **Dúnedain Lookout:** the native enemy When Revealed cancellation window discards the chosen physical ally through its controller. Sacked Lookouts cannot initiate it, and encounter-origin/cancellation restrictions apply at the shared reveal window.

Six designs have new native integrations:

- **Haradrim Spear:** Harad attachment restriction and Restricted; +1 attack while attached; optional response when that character is declared as an attacker grants +3 for that attack and creates a saved delayed discard tied to that exact attachment. Declining keeps the Spear. The bonus ends on actual attack completion.
- **Hunting Party:** requires separate unique Warrior and Scout characters controlled by its caster. Its response occurs once after all seats finish committing, before regular staging. It discards a legal non-unique staging enemy and then reveals one additional encounter card. Immune and non-discardable enemies are excluded before spending the event.
- **Keep Watch:** a six-progress side quest; in victory it gives each non-unique engaged enemy -1 attack. Staging and unique enemies are unaffected. A duplicate completed copy goes to its physical owner's discard instead of creating another victory effect.
- **Rider of Rohan:** its native quest commitment does not exhaust it while a player or encounter side quest is in victory. The usual exhaustion applies otherwise.
- **Doughty Ranger:** hero attachment restriction, one per hero, Ranger trait; after its controller plays it from hand, an optional saved response draws one card. Another player's attachment play does not count as the host controller playing it.
- **The Free Peoples:** the play gate counts distinct traits on characters controlled by the caster. It readies affected characters across participating seats, respects readiness restrictions and immunity, and gives only the caster's affected characters +1 willpower until the phase ends.

Player effect kinds start with `beneathSandsPlayer`, distinct from scenario effects. Choices, physical source IDs, controller seats and delayed attack markers are JSON serializable.

`tests/beneath-sands-player.test.ts` exercises the ten designs through native play, attack, quest commitment and quest resolution actions, including reloads at choices and payments. It also rehearses browser fixtures before evidence capture. `scripts/browser-beneath-sands-players.mjs` requires 30 checkpoints at each of 1280, 390 and 320 pixels: native controls and resulting physical card movements, plus all ten original faces with served-byte SHA-256 equality against the cached JPEGs. The saved report binds its script hash and the reviewed build artifact.

Final player verification passed **21 native tests**, **72 existing Mûmakil/Race player regressions**, and **90 responsive browser checkpoints** (30 at each width). All ten original faces were checked against their served-byte hashes. The run recorded zero browser errors and 19 matching HTTP-200 entry-body witnesses for `index-URo7Jbxv.js` (332,864 bytes; SHA-256 `6917dc937541b1dd2af1927830ec2e1127faea19f027d20eb333f823ff27c772`). The final browser report is generated at `output/beneath-sands-players/report.json`; preliminary rehearsals are excluded.
