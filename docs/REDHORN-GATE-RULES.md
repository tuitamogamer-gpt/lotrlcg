# The Redhorn Gate rules support

The original normal/easy recipes use The Redhorn Gate and Khazad-dûm's Misty Mountains set. The separate Nightmare cards remain reference content pending their own scripting.

## Primary sources

- [FFG original rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/db/86/db86ab85-0748-4933-9367-1673526c9b53/the-redhorn-gate-rulesheet.pdf): difficulty six; Arwen is a controlled ally, follows the first-player token and prevents other copies of her title from entering play. Her departure or controller's elimination loses the game. Snowstorms begin set aside. Only quest-card effects can make Caradhras active.
- [FFG Easy Mode](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/support/easy-mode/LOTR_Easy_Mode.pdf): remove two Rocky Crags, two Freezing Cold, Avalanche, two Mountain Trolls, one Mountain Warg and one Turbulent Waters. After setup removes Snowstorm, Arwen and Caradhras, the encounter deck contains 37 normal or 28 easy cards.
- [FFG FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf): Snow Warg's erratum uses declaration as defender for its forced damage. The Redhorn Gate question explicitly requires Caradhras to return from the victory display when stage two completes. Section 1.34 supplies first-player choice for a singular active-location instruction when several are active.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf): encounter lasting effects apply to later qualifying cards; forced effects precede optional responses; discard differs from destruction; progress beyond a completed quest does not carry onto the next quest card.

## Scripted rules

The fixtures retain fourteen original encounter designs and three double-sided quests with thresholds nine, eleven and thirteen. The shared Misty Mountains cards retain their independent easy quantities.

Arwen's resource response uses actual exhaustion, including card costs and defense declaration, and permits an eligible hero controlled by another player. Her controlled ally state, damage and attachments move with the first-player token. Departure checks precede optional leaving-play responses.

Freezing Cold lowers willpower and prevents ordinary commitment. Its second unblanked copy discards its bearer. Snowstorm creates a phase effect on questing characters; its shadow affects the defending characters and discards them at zero willpower. The final quest independently discards every zero-willpower character. These are discard effects and do not trigger destruction-only effects. Avalanche's forced commitment is independent of ordinary commitment permissions and emits actual commitment responses.

Fell Voices recovers the top two Snow cards of any type. Its conditional surge depends on whether both recovered cards are treacheries. When distinct cards are returned together, the first player chooses their order. Fallen Stones removes all progress or reveals two cards sequentially. Mountain enemy bonuses count staged Mountain locations; Snow Warg permits hero defenders and deals its forced damage before optional defense responses.

Rocky Crags requires each player to damage a chosen character before travel. Dimrill Stair recycles discarded and victory locations and removes their victory points. Its threshold then reduces threat and removes Freezing Cold. Celebdil loses two progress each round while active. Fanuidhol asks committed heroes to pay from their own resource pools before willpower is counted.

Snowdrifts creates the Caradhras buffer after its eleventh token, discarding the singular selected active location. Caradhras retains progress when moved from staging; a return from victory enters afresh and removes its former points. Surplus from that placement may fill the new buffer and does not carry onto the next quest. This sequencing follows the printed token trigger and common active-location rules; no separate primary ruling on this surplus case was found. Final victory requires thirteen quest progress and five victory points together.

## Verification

`tests/redhorn-gate.test.ts` passes all 28 focused tests covering exact 1–4-player setup recipes, controlled Arwen behavior, departure losses, printed encounter clauses and shadows, phase modifiers, forced commitment, multiplayer costs, victory recycling, all three stages, multiple active locations, zero-willpower timing and save/reload. The combined original expansion scenario regression passes all 249 tests. Complete seeded ordinary/guided/hidden/decisions simulations also pass.

`node --import tsx scripts/browser-dwarrowdelf-scenarios.mjs` passes at 1280, 390 and 320 pixels with no page or console errors. The Redhorn cases commit Arwen, choose her actual resource response, reload the resulting state, check the final five-victory-point goal and inspect the printed quest reverse. Screenshots are retained in `output/dwarrowdelf-scenarios`. These are local verification results and do not imply deployment.
