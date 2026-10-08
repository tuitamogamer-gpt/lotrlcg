# The Lost Realm player rules

This first batch registers eleven new designs: Tactics Aragorn, Halbarad, Weather Hills Watchman, Dúnedain Hunter, Warden of Annúminas, Tireless Hunters, Expert Trackers, Heir of Valandil, Athelas, Secret Vigil and Star Brooch. Sarn Ford Sentry reuses its existing Collector handler. All twelve original faces are local assets.

Ranger Summons and Ranger of the North are now registered in a second batch. Gather Information completes all fifteen player designs in the side-quest follow-up below. Intruders in Chetwood is now playable in original/easy mode; The Weather Hills is also playable with its independent Orc deck and Mission; see [Weather Hills rules](WEATHER-HILLS-RULES.md). Deadmen’s Dike completes the original/easy box with deck depletion, Thaurdir and three encounter side quests; see [Dike rules](DEADMENS-DIKE-RULES.md). See [Chetwood rules](CHETWOOD-RULES.md).

## Sources and implementation

- Original printed definitions and provenance are retained from the reference catalog (`09001`–`09015`, The Lost Realm). Local faces use the matching original OCTGN identities in DragnCards.
- [Official expansion rules](https://images-cdn.fantasyflightgames.com/filer_public/88/d6/88d6e80d-e75d-468f-8484-76c56b15e895/mec38_insert_web.pdf) distinguish Encounter allies, side quests and ordinary player cards.
- Aragorn modifies enemies engaged with his controller, including considered engagements, and responds only after participating in an actual killing attack. His optional engagement can take an enemy from another player.
- Halbarad grants one additional optional engagement per encounter phase and remains ready when committing while engaged. Warden counts its controller's engaged enemies.
- Watchman searches five physical deck cards, takes the selected Signal and shuffles. Hunter's Forced search selects a nonunique enemy among the top five; putting it directly into engagement does not reveal it. With no eligible enemy, Hunter is discarded.
- Tireless Hunters is restricted to the combat opening before normal enemy attacks. It resolves engagement reactions before choosing an attached shadow, preserves faceup/facedown identity, and offers a saved action window if the engine would otherwise skip an empty enemy-attack list.
- Expert Trackers is an engagement response. Its controlled Scout/Ranger exhaustion is paid before event cancellation, and its progress uses printed enemy threat.
- Heir snapshots the current engaged count, stacks discounts, affects only the next Dúnedain ally played during the phase, and is not consumed by putting an ally into play.
- Athelas pays its discard and bearer-exhaustion costs, respects healing restrictions, and can remove an optional Condition from the healed character, including an undamaged character with a Condition.
- Secret Vigil's destruction response uses printed threat for every living player. It keeps its physical source and owner after discard so The Empty Mug removes the correct copy once. Discarding an enemy does not trigger destruction.
- Star Brooch follows its bearer's controller. While engaged, it adds willpower and prevents independent negative willpower modifiers without suppressing positive bonuses.

## Evidence

- `tests/lost-realm-player.test.ts`: 39 semantic cases, including original registration, target restrictions, multiplayer control and ownership, actual combat, search boundaries, paid/canceled responses, physical shadows, phase limits and saved decisions.
- Broad engine/account regression: 2,423 tests passed; hot-seat suite: 21 passed.
- `tests/simulation.test.ts`: the dedicated 50-card Aragorn/Halbarad fellowship completes ten seeds each in Mirkwood and Tharbad. All twenty ended in losses under the test policy; this checks termination and legal state, not balance. Additional complete-game comparisons match `all`, `hidden` and `decisions` review modes.
- `scripts/browser-lost-realm-players.mjs`: 36 checkpoints at 1280, 390 and 320 pixels, real payment/attachment/action/response controls, reload during decisions, all twelve original faces decoded, no browser errors or horizontal overflow. The mobile combat-opening decision was visually reviewed.
- Type checking and production build pass. No account-schema migration is required for this batch.

Registration after this batch: 435 player definitions, 50 heroes, 385 deck cards, 485 encounters and 36 scenarios; 1,044 of 4,183 reference identities and 72 of 355 scenario recipes are registered. There are 3,139 reference identities pending.

## Encounter allies follow-up

Ranger Summons and Ranger of the North implement the official Encounter keyword. Every player starts with three Rangers set aside; setup can explicitly request zero to three. Each successful Summons consumes only its controller’s reserve, shuffles one Ranger into the current encounter deck, and removes the resolving physical Summons. Cancellation spends the event without consuming the reserve or resolving self-removal. The reserve survives rounds and reloads; leaving play never replenishes it.

Ranger’s When Revealed cannot be canceled. The first player chooses the receiving fellowship and then resolves either two enemy damage or two location progress before Surge. A shadow Ranger follows the normal encounter discard route without its When Revealed or Surge. A controlled Ranger keeps Ranged/Sentinel and is removed on destruction, discard, return to hand/deck, simultaneous return or controller elimination. Attached player cards retain their ordinary ownership and discard rules.

Encounter allies are excluded from player deck construction, minimum size and ordinary hand plays. RingsDB imports explain their set-aside role without labeling them unimplemented. Save validation rejects invalid reserve counts and Encounter allies in player hands/decks. Older saves without this newly introduced field receive the untouched three-card reserve.

Evidence: 21 focused Ranger cases; 2,443 broad regressions passed before the additional import-report case; twenty complete games with Summons in the 50-card test list plus matching full-game outcomes across all three review modes. Eighteen browser checkpoints at 1280/390/320 exercise actual payment, multiplayer control, both aid modes, Surge, saved choices and Born Aloft removal. Both new faces decode locally, and the mobile first-player decision was visually reviewed. Type checking and production build pass.

Registration after the Encounter batch: 437 player definitions, 50 heroes, 386 deck cards and one set-aside Encounter ally; 485 encounter definitions and 36 scenarios; 1,046 of 4,183 catalog identities, with 3,137 pending. Fourteen of the fifteen Lost Realm player designs are implemented.

## Gather Information and player side quests

Gather Information (`09014`) costs zero, has four quest points, Victory 1 and a one-copy deck limit, verified against its local original printed face. RingsDB import now respects printed copy limits as well as the general maximum of three.

Player side quests enter staging through normal planning plays or valid card effects. At the beginning of each quest phase the first player chooses the main quest or one physical side quest. Active locations buffer progress first. Each side quest retains its own progress between rounds; the main quest retains its existing progress and text. Defeat moves exactly that physical copy into the victory display, discards its attachments and resolves quest-defeat responses. Excess progress is discarded. The selected side quest remains current until the entire quest phase ends, including if it was already defeated or left play. Combat-phase quest progress returns to the main quest.

The engine distinguishes main quest advancement from the current quest. Independent main-stage objectives can still advance. Main-quest attachments and forced effects remain active; Battle/Siege and effects targeting the current quest use the actual selection. The Long Defeat may attach to any quest in play, including an unselected side quest during planning. Conditions on either quest remain active. A separated Foundations of Stone staging area makes its own selection and restricts responses to its own players; save/reload retains those choices and physical progress.

Gather Information offers an optional response. Once accepted, each player independently chooses an indexed physical card in their own deck or declines the search, then shuffles. Taking the card is not a draw and does not trigger Dunland draw reactions. Responses and hidden choices persist across reloads. Main-quest inspection remains available while the side quest is shown in the journey panel.

Timing reference: [Caleb Grace's ruling, 22 April 2015](https://ffg-forum-archive.entropicdreams.com/topic/164372-side-quests-vs-legolas-gondolin-blade-in-combat-phase/) confirms that defeating a side quest early does not resume main-quest progress within the same quest phase. The expansion insert linked above defines first-player selection, active-location buffering, victory and discarded overflow.

Evidence: 39 focused side-quest cases, including real card play, quest selection, location buffering, overflow, retained completed selections, direct progress/removal, independent searches, imported copy limits, main and side attachments, Trained for War, The Long Defeat, Mendor, free plays, tracked hidden identity, saved decisions, independent main-stage advancement and separated staging areas. The dedicated 50-card Lost Realm test list now includes one Gather Information; twenty complete games terminate and all three review modes produce matching outcomes. All twenty seeds remain losses under the test policy. Twenty-four browser checkpoints at 1280/390/320 cover actual play, first-player choice, quest inspection, real successful quest resolution, response searches, decline, and reload during decisions. The original face decodes locally. Final engine/account regression passes 2,483 tests, with 21 hot-seat cases passing separately. Type checking and production build pass. The mobile journey panel was visually reviewed.

Registration after the player batch: 438 player definitions, 50 heroes, 387 deck cards and one set-aside Encounter ally; 485 encounter definitions and 36 scenarios; 1,047 of 4,183 reference identities, with 3,136 pending. All fifteen Lost Realm player designs are implemented. No account-schema migration is needed.

## Cross-scenario verification

The automated player now actually plays Ranger Summons and player side quests during planning, and chooses Gather Information when it is available. The deterministic sweep uses seeds 10 and 31, which put Gather Information in the opening hand. Across all 38 supported scenarios, 76 games terminate with valid saves after every action, and another 38 runs match the `decisions` review mode exactly. The sweep explicitly records a played Summons, a played and selected Gather Information, and a defeated Gather Information. All 76 game outcomes are losses under this simple test policy; the test establishes legal execution and consistent state, not deck strength.
