# Final Ring-maker player packs

All thirty player designs from **The Nîn-in-Eilph**, **Celebrimbor's Secret** and **The Antlered Crown** (`08084`–`08093`, `08112`–`08121`, `08137`–`08146`) are registered. Nineteen are new implementations; eleven reuse existing starter and Collector scripts. This completes the sixty player designs in the six Ring-maker adventure packs. Their encounter scenarios and the Voice of Isengard quests remain pending.

The pinned RingsDB records in `public/catalog.json` supply the original text, identities, quantities and provenance. `src/data/ring-maker-final-player-cards.json` preserves the complete player-pack snapshot. All thirty original faces are cached locally. Registration makes the designs available to hero selection, deck building, public deck import and saved games.

| Card | Executable behavior |
| --- | --- |
| Follow Me! | Take the first-player token and draw one card. Continuous first-player allies and their attachments follow the token; the current planning turn is preserved. |
| Tighten Our Belts | Refresh action choosing a player. Heroes that have spent no resources this round gain one. Actual card/ability/travel payments are tracked separately from zero payments, transfers and losses. The once-per-round play limit is shared and is consumed even if the event is canceled. |
| Bow of the Galadhrim | Restricted attachment for a Silvan character with printed or granted Ranged. +1 attack, with the extra +1 evaluated against the enemy's engagement with that attacker’s controller, including virtual engagement. |
| Celduin Traveler | Secrecy 2. Optional entry response looks at the physical top encounter card and may discard it only if it is a location. Looking does not reveal the card or consume first-reveal triggers. |
| Island Amid Perils | Return a controlled Silvan ally as the ability cost, before cancellation, and reduce threat by its printed cost. Leaving-play responses and original-owner hand/discard destinations remain intact. |
| Mirkwood Pioneer | Optional Doomed 1 only when played from hand. If granted, an optional response suppresses the chosen staging card's threat through the round, independently of the Pioneer remaining in play. |
| Defender of the West | Attach to a non-objective unique ally. Its continuous ability transfers control to the first player, preserving ownership, damage, readiness and attachments. Its controller may assign undefended attack damage to that ally. Removing or blanking the attachment stops future transfers; the last control change has no duration and therefore persists. |
| Henneth Annûn Guard | Optional Doomed 1 from hand. If granted, an optional response gives any eligible character +2 defense and Sentinel for the round. The lasting grant survives phase changes and the source leaving play. |
| Charge of the Rohirrim | Snapshot eligible Rohan characters with Mount attachments when the action resolves. Give those characters +3 attack through the phase, even if they subsequently lose the qualifying trait or attachment. |
| Mirror of Galadriel | Attach to Galadriel. Exhaust to search only the top ten cards, add a chosen physical card to hand, shuffle the remainder into the deck and discard a seeded random hand card. Searching fewer than ten works. Declining the search shuffles without the dependent random discard. Borrowed deck identities survive search, shuffle and reload. |
| Wandering Ent | Enters exhausted, including put-into-play effects; cannot have Restricted attachments. |
| Erkenbrand | Sentinel. While defending, may take one actual damage as a cost to cancel the triggering shadow effect. Optional damage cancellation/redirection cannot pay this cost. Works during cross-player Sentinel defense, respects shadow-cancellation prohibitions and permits a lethal cost. |
| The Day's Rising | Attach to a Sentinel hero. After a defense with no damage taken during that attack, optionally exhaust to grant one resource, including ordinary resource-gain responses. An attack ledger records shadow, combat and cost damage even if healed before the attack ends. |
| Booming Ent | Enters exhausted; cannot have Restricted attachments. Its live attack bonus counts damaged Ent characters controlled by its current controller, including itself. |
| Ride Them Down | Choose an eligible non-unique staging enemy during the quest phase. After active-location buffering, replace only successful-quest progress with damage to that physical enemy. Direct card-effect progress is unaffected. The latest replacement applies; it lasts through the phase even if the target leaves. Capped active locations still buffer the quest. |
| Shadows Give Way | Requires payment from three distinct hero pools. Both ordinary and discard plays validate this; free plays cannot bypass it. The payment dialog defaults to three heroes and rejects invalid distributions. Discards physical shadow cards across all enemies in the shared play area, updating their visibility and attached-shadow protections. |
| Don't Be Hasty! | A saved response window before encounter keywords and When Revealed effects permits each physical copy to ready and remove a committed character, including another player's character. Thalin and Warden passives precede it; withdrawing Thalin does not undo his already-triggered damage. |
| Waters of Nimrodel | Doomed 3 resolves before the cancelable healing ability. Heal all eligible characters in the shared play area, respecting immunity, healing prohibitions, Wilyador's cap and the physical healer-removal rule. |
| Treebeard | Enters exhausted; cannot have Restricted attachments. Collects one resource each resource phase while its text is active. Its pool can pay Ent cards played from the controller’s hand without a sphere match, and is visible on the table and in the payment dialog. Pay two resources to ready any eligible Ent, including another player's; Treebeard need not be ready. |

Mablung, Galadhon Archer, Wingfoot, Galadriel, Heir of Mardil, Orophin, Galadriel's Handmaiden, Cloak of Lórien, Nenya, Warden of Helm's Deep and Captain of Gondor retain their existing scripts and canonical original-product provenance.

## Rules sources

- Printed card text: the pinned RingsDB snapshot and [Nîn-in-Eilph](https://ringsdb.com/set/NiE), [Celebrimbor's Secret](https://ringsdb.com/card/08112), [The Antlered Crown](https://ringsdb.com/card/08137) records.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf): Cost and “To”; Lasting Effects; Ownership and Control; Replacement Effects; Search; Then. In particular, lasting player effects snapshot eligible cards, the most recent replacement applies, and a control change without a specified duration persists while the card remains in play.
- Mirror with fewer than ten cards: Caleb Grace's answer **3.235**, reproduced in the [community FAQ compilation](https://alongextendedparty.com/semi-official-errata-faq-1-10/). Its “then” depends on having added a card, not on finding a full ten-card search window.
- Warden's passive timing: ruling **3.188** in the same compilation, as documented in [Trials/Tharbad rules](TRIALS-THARBAD-PLAYER-SCRIPTS.md). Doomed timing and optional grants reuse the [Voice of Isengard rules](VOICE-ISENGARD-PLAYER-SCRIPTS.md).

Existing shared timing boundaries in [COVERAGE.md](COVERAGE.md) still apply, including the absence of a general simultaneous-response ordering editor.

## Validation

- `tests/ring-maker-final-player.test.ts`: 50 semantic checks covering all nineteen new designs, public actions and payment, physical costs and cancellation, cross-player targets/control, replay origins, borrowed deck identities, blanking, healing restrictions, successful quest replacement, saved responses and round/phase expiry.
- Local regression: 1,856 semantic tests passed, plus 21 non-simulation hot-seat tests. The long seeded-game matrices are separate and were not rerun for this batch.
- TypeScript and production build passed. All thirty cached image files were decoded and verified.
- `scripts/browser-ring-maker-final-players.mjs`: 42 screenshots across 1280×900, 390×844 and 320×750, real payments and responses, pending-choice reloads, cross-player choices, all thirty image decodes, no overflow/clipped dialogs or browser errors. Included in `npm run test:ring-maker-players` and the existing CI browser job.
- Registration inventory: 424 player definitions (48 heroes, 376 deck cards), 364 encounter definitions, 27 scenarios, 880 of 4,183 catalog identities and 54 of 355 scenario recipes. There are 3,303 reference identities still pending.
