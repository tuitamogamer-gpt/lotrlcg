# The Crossings of Poros

Original MEC61 standard/easy scenario, difficulty 5, for one to four players.
The implementation follows the [printed original sources](CROSSINGS-POROS-SOURCES.md).

The physical quest pool contains seven cards: stage 1, two alternative stage
2s, three alternative stage 3s, and stage 4. At the end of the first planning
phase, seeded randomness selects The Desert Path or The Ephel Dúath. Completing
that route selects one of Deadly Creatures, Southron Pursuit and Orc Patrols.
Unchosen quest cards remain in their printed removed or set aside zones.

Five set aside encounter sets retain actual physical components and separate
remaining counts. A largest-set tie lets the first player choose a tied set,
then seeded randomness takes one card. The native reveal queue resolves
keywords, cancellation, and When Revealed effects. Cards incorporated into
play, deck or discard leave their set aside pool permanently. Removing an
unchosen stage-two set cannot erase already-incorporated cards.

All new encounter and stage effects are implemented, including alternative
pursuit costs, immediate attacks from staging, variable Desolate Land and
Shadowy Vale threat, cancellation and threat-reduction locks, ally entry
penalties, all three engagement penalties, dynamic Orc Patrols quest points,
Southron Champion, shared Desert Sands/Creatures responses, and deferred
shadow follow-ups after actual character destruction. Existing Harad Soldier
and Mordor Orc mechanics are reused through their engine hooks.

Poros Garrison enters under the first player's control at stage 4, grants its
controller one extra optional engagement, is immune to player card effects,
and causes a loss if it leaves play. The Black Serpent scales with the main
stage, remains in staging, and cannot be damaged. The final stage can only
be defeated at the end of combat; having 20 progress earlier does not win.

Save validation covers quest branches and all seven quest identities,
physical set aside/removed zones, champion links, poison markers, and
Garrison state. Pending choices and combat continuations survive reload.
The scenario panel shows counts without exposing random set aside card
order and provides both printed faces of every quest for inspection.

Validation lives in `tests/crossings-poros-import.test.ts`,
`tests/crossings-poros-scenario.test.ts`, and
`scripts/browser-crossings-poros.mjs`. The browser workflow exercises native
setup, travel, staging, quests, defense, and the final combat, then inspects
all 45 printed faces and checks served artwork hashes at desktop and mobile
widths. Full browser evidence must use the root task's frozen build URL.
