# The Long Dark rules support

The original scenario implements thirteen encounter designs, two double-sided quests and the shared Twists and Turns / Hazards of the Pit sets. Its physical encounter pool contains 59 cards in normal mode and 43 in easy mode, including Cave Torch. Removing the Torch leaves 58 / 42 cards before setup moves locations to staging. The two quest cards are separate components. Nightmare remains reference content.

## Sources

- [FFG original rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/82/5f/825f170d-3a2a-45a8-a145-f7f0c55ae13a/the_long_dark_rulesheet.pdf): difficulty seven, the exact encounter sets, Cave Torch setup/removal, single-player Locate tests, explicitly triggered Lost effects and the absence of a next player in solo games.
- [FFG Easy Mode](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/support/easy-mode/LOTR_Easy_Mode.pdf): original orange-ring removals, including shared-set quantities. Canonical fixtures retain physical per-design normal/easy quantities and printed PASS corner labels.
- [FFG FAQ 1.9](https://images-cdn.fantasyflightgames.com/filer_public/1d/bb/1dbb319c-6b1e-466e-9177-75a5857b5cfa/lotr_faq_19_printer_friendly.pdf): first-player ordering of conflicting simultaneous effects; forced effects before optional responses; actual encounter-card revelation versus adding a card to staging; encounter attachments remain uncontrolled unless control is explicitly granted.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf): do as much as possible for non-targeting effects, exact chosen target requirements, Then dependencies, damage cancellation/replacement, elimination and immediate exploration.

The live DragnCards Q02.7 / E02.7 reference recipes used Deeps of Moria instead of Hazards of the Pit. The importer overrides those two shared encounter sections using the official rulesheet and retains a provenance note. Cave Torch remains a single card in the staging/setup section; it is not duplicated in the encounter deck.

## Implemented behavior

Setup lets the first player assign Cave Torch to any hero, then adds at least one location, or one fewer than the player count, without revealing those locations. Discarded non-locations are shuffled back. Stage one gives every location one additional threat and advances at thirteen progress. Stage two performs its first-player Locate test before completing revelation: a failure reveals one complete encounter card per living player, then triggers Lost. Seventeen final-stage progress wins immediately.

Each Locate attempt discards a selected physical hand card and one encounter card. Only that card's printed PASS corner succeeds. Non-PASS cards permit another attempt; the player can explicitly fail without paying another discard. An empty hand or an unavailable encounter card ends the test. Discarded cards are not revealed, explored or awarded victory points. Test source, player and both continuations survive saves. If the tester is eliminated, the original failure continuation resolves for the surviving table.

Lost snapshots the unblanked abilities currently in play; the first player orders multiple effects. A newly returned Warlord does not join that snapshot. Mine returns up to two qualifying Goblins from the top of discard without revealing them. Forge selects all players' hand discards before applying them. Warlord similarly selects controlled allies, including objective allies, before discarding them. Caverns exhausts characters that can actually exhaust. Deferred entry, exhaustion and leaving-play responses preserve the complete mandatory instruction.

Twisting Passage tests before a nonzero progress placement. A pass resumes that exact placement and its remaining framework progress; failure places none and loses the entire blocked remainder. Direct player-card placements and multi-active-location allocations use the same rule. Zero progress and blanked text do not start tests.

Cave Spider draws before requiring exactly four hand cards; a prevented draw suppresses Then and fewer than four cards remain untouched. Its engagement discard affects only the engaged fellowship. Greaves is selected by the first player, may attach to any hero and grants one defense as an uncontrolled encounter objective. Gathering uses current card threat plus remaining quest points, lets the first player resolve ties and grants enemies surge even if their When Revealed effect is cancelled. Attachment blanking suppresses this passive.

Fatigue selects every fellowship's eligible character before exhaustion and its conditional surge. Its shadow affects only the defending fellowship. Sacked does not prevent exhaustion to satisfy a different card's effect. Goblin Sneak retains its physical identity through successive next-player engagements; solo discards once without transferring. Its shadow moves the actual shadow card into staging and adjusts revealed-shadow accounting. Rock Adder becomes attackable only after it actually deals damage that round; Frodo cancellation leaves it restricted. Its undefended shadow discards, rather than destroys, a controlled character.

## Verification and interpretations

`tests/long-dark.test.ts` has 48 focused tests covering all printed designs and shadows, one-to-four-player normal/easy setup, Locate retries, both continuations, elimination, atomic multiplayer selections, objective allies, blanking, progress buffering, threat/damage cancellation and save validation. Complete ordinary, guided, hidden and decisions-mode seeded games pass with all four Core starters. The campaign-only case is skipped because the supported campaign covers Core chapters.

`node --import tsx scripts/browser-long-dark.mjs` passes at 1280, 390 and 320 pixels with no page or console errors. It exercises actual quest resolution into stage-two Locate, a non-PASS retry after reload, physical hand selection, a PASS discard without revelation/victory, the printed quest reverse and a Foul Air failure with persisted damage. Screenshots are in `output/long-dark`. These are local validation results.

No Long Dark-specific published ruling was found for interrupted multi-active progress or for an eliminated Locate tester. The implementation derives those cases from the printed progress prohibition, the existing active-location buffer rule and the test's inability-to-discard failure condition. Mine's partial two-Goblin return follows the general non-targeting do-as-much-as-possible rule. These are explicit general-rule interpretations, not scenario-specific FAQ claims.
