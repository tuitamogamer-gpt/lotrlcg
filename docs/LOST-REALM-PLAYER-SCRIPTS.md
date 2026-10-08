# The Lost Realm player rules

This first batch registers eleven new designs: Tactics Aragorn, Halbarad, Weather Hills Watchman, Dúnedain Hunter, Warden of Annúminas, Tireless Hunters, Expert Trackers, Heir of Valandil, Athelas, Secret Vigil and Star Brooch. Sarn Ford Sentry reuses its existing Collector handler. All twelve original faces are local assets.

Ranger Summons, Ranger of the North and Gather Information remain unregistered in this batch. The Encounter keyword and player side quests require their own complete frameworks before those three cards become playable. The three Lost Realm scenarios also remain pending.

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
