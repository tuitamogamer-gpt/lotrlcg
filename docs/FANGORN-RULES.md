# Into Fangorn — original and easy

`into-fangorn` implements all three quest stages and thirteen encounter designs from Into Fangorn, Ancient Forest and Weary Travellers. The original/easy recipes contain 35 / 25 physical encounters, including Mugash and Edge of Fangorn. Setup places those two in staging with the Edge guarding Mugash, leaving 33 / 23 cards before the players-minus-one setup reveals. One to four players and easy mode's extra starting resource are supported. Printed difficulty is 6.

## Sources and timing

- Complete imported rows and recipes are retained in `src/data/fangorn-*.json`, from the pinned DragnCards snapshot in `public/catalog.json` and `public/scenarios.json`. The original provenance and hashes remain in `public/data-metadata.json`.
- [FFG Voice of Isengard rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/cd/e6/cde67433-f555-4fbe-b45d-28dca420e7b3/the-voice-of-isengard-rulesheet.pdf), pages 2 and 8–9: Time, encounter sets, difficulty and Hinder.
- The original thirteen encounter faces and six quest faces are cached locally. Printed card text governs each clause, including stage three's choice from the **entire encounter discard pile**, rather than only the five cards just discarded.
- [Scenario guide](https://visionofthepalantir.com/2018/06/11/into-fangorn/) provides a secondary cross-check. Its shorthand about the five discarded cards and a bearer leaving play is not used to override the printed text. Mugash's printed return-to-deck Forced effect requires actual damage; a non-damage departure discards the attachment by the ordinary attachment rule.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf): attachment departure, Guarded, resource/refresh timing, simultaneous effects and extra attacks.

## Implemented rules

| Cards / stages | Behavior |
| --- | --- |
| Into the Woods | Time 4, nine quest points, guarded setup and players-minus-one reveals. Progress may accumulate without Mugash; advancement requires a hero to hold him. The last counter shuffles Mugash into the encounter deck and advances to stage three. |
| Escape from Fangorn | Each player searches the encounter deck and discard for a Huorn and adds it to staging; repeated titles are legal. Time 4, twelve quest points and a captive Mugash are required to win. A timeout returns to stage three. |
| The Angry Forest | Time 3. Timeout discards up to five actual deck cards without reshuffling, then each player reveals an enemy/objective from the full discard pile; Guarded and When Revealed resolve normally. Time resets to three. The stage-two transition triggers only after new quest progress is placed while Mugash is held and at least six progress is present. Claiming Mugash after already reaching six does not itself advance. This Forced advancement interrupts later queued effects. |
| Mugash | Exhaust an eligible hero to claim the unguarded physical objective, without raising threat or using a restricted slot. The hero can subsequently ready normally. Actual damage returns Mugash to the deck top before lethal damage removes the hero; prevented/zero damage does not. A non-damage departure uses the encounter discard pile. Timeout shuffling clears guarding links and removes the original copy from its prior zone. |
| Hinder / Huorns | Hinder enemies skip normal combat shadow dealing and attacks. At combat start they remove one progress each, starting with the quest and then active locations. Players can attack them normally. The prohibition applies during combat; their resource-phase and encounter-triggered attacks outside combat receive fresh shadows and resolve normally. Huorns cannot have attachments while their text is active. |
| Dark-Hearted / Angry / Deadly Huorn | At resource-phase start, the engaged player respectively gains two threat, receives an immediate attack, or chooses one controlled character to take three damage. The first player orders simultaneous Forced effects. These effects finish before resource collection and the framework draw; elimination cannot strand surviving players' collection. |
| Ancient Forest / Tangled Woods | Ancient Forest grants staging Forests +1 threat and +3 quest points, without stacking. Losing the bonus can immediately explore a location with enough stored progress. Tangled Woods grants one additional hero-exhaustion travel cost to Forests, without stacking; this combines with Edge's printed cost. |
| Edge of Fangorn | Immune to player effects, victory 1. Travel requires one Huorn from deck/discard, or two with at least three players; the full cost must be payable before travel begins. Searches add without revealing and preserve the objective's guarding link. |
| Heart of Fangorn | While staging, each player chooses up to five distinct exhausted characters to ready during refresh. Readying restrictions and Caught in a Web payments still apply. A saved per-player ledger also enforces the cap during the refresh action window, without charging blocked readying costs. Ready characters are not exhausted by this restriction. The shadow schedules a real additional attack after the current one. |
| The Forest's Malice | Cannot be canceled. Players order immediate attacks by engaged Huorns; only actual initiated attacks satisfy the condition. If every attack was prevented, each player still searches deck/discard for a Huorn and puts it into play engaged. |
| Low on Provisions | Each player allocates their own character-count damage among their own characters; physical assignments are saved and dealt after allocation. Shadow grants +1 attack, or +2 against an undamaged defending character. |
| Turned Around | Offers only payable alternatives: remove one quest time counter, or return an active location to staging without losing its progress, attachments or guarding link. Its shadow returns a location only for an undefended attack. |
| Off Track | Separate Surge, then a physical Condition on a location, limit one per location. Adds two quest points and an additional end-refresh time removal for each copy. The first player can order these removals; a later removal can affect a newly entered stage. |
| In Need of Rest | Removes an eligible questing hero, attaches a physical Condition with limit one per hero, and deals one damage per actual time counter removed. Simultaneous Conditions and a last-counter effect offer a saved first-player ordering choice. Standard Condition removal works. |

Advancing by Time or stage three's special instruction discards quest attachments without triggering defeat responses such as The Long Defeat. Actually defeating stages one or two resolves those responses normally.

Scenario counters, quest goals, objective claiming, stage faces and event history expose the live state. Pending searches, travel payments, refresh selections, allocations, Forced ordering and attacks round-trip through saves. The existing forest artwork supplies the playmat; all nineteen original faces are cached independently of that presentation.

## Verification and scope

`tests/fangorn.test.ts` contains 57 semantic tests, including all eight normal/easy player-count setups and malformed save rejection. The responsive suite exercises actual controls and reload at 1280, 390 and 320 pixels, with 63 checkpoints and all nineteen card faces decoded. Its quest-face check verifies the actual table image in addition to the asset inventory. It runs in `npm run test:ring-maker-quests` and GitHub CI. Screenshots and result JSON remain under ignored `output/fangorn/`.

The account-choice migration is additive and covered by local PGlite policy tests. Hosted Supabase changes are not part of this release. This completes original/easy The Voice of Isengard; the six Ring-maker Adventure Pack quests, Nightmare and additional campaign variants remain pending.
