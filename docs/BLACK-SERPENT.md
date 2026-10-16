# The Black Serpent

Original MEC59 scenario, difficulty 8; 1–4 players in standard and easy mode.
Sources, corrected print metadata, exact deck counts and scan pins are in
[BLACK-SERPENT-SOURCES.md](./BLACK-SERPENT-SOURCES.md).

The three main stages have 6, 5 and 6 quest points. At each stage the first
player automatically chooses one of their heroes for every unattached Harad
objective in play. A stage cannot be defeated while an in-play objective is
attached to an encounter card or unclaimed. Setup/stage-2 Guarded (X) discards
to the correct enemy/location type without revealing the guarding card. The
last objective attaches directly to The Black Serpent at stage 3.

The boss gains threat, attack and defense equal to the current main stage.
Its staging and damage prohibitions lift at six progress on stage 3. During
stage 2 it remains one physical staged card, considered engaged with every
player who controls an objective; normal attacks and shadow cards belong to
each actual attack. The end-of-encounter attack offers removing the full
stage number of progress only when enough progress exists.

Physical Harad objectives attach directly to their guard/hero. Guard defeat,
location exploration and hero departure release the same objective ID into
staging for mandatory first-player claiming. No Quarter reguards that same
copy. Objective actions exhaust the objective and raise its controller's
threat before applying their benefit. Banner and Garb modifiers expire at
the end of their phase; Summons prevents threat reduction while guarded.

Serpent Guard's engagement and shadow alternatives track their exact round
and player/enemy. Roofless Tower interrupts a paid event and either removes
one main quest progress or cancels that event's effects. Each staged Redoubt
separately reacts to an ally played from hand. Southron Camp clears location
progress, Broken Courtyard caps main progress, Chaos can block all quest
progress for the round, and Don't Let Them Escape! removes main progress at
round end and reveals a card when selected. The shared Harad Soldiers set
retains its engagement choices, captain bonuses, Archery and Champion.

All decisions use serializable queued effects. Validation checks the ordered
quest chain, exactly three unique objective copies across actual zones,
physical identity collisions, set-aside cards, round/phase modifiers and
Champion/protection markers. Public state exposes the count of unrevealed
objectives; their identities and order remain private. The responsive scenario
panel shows current stage, claimed/guarded objectives and the boss's current
protection, and offers inspection of both original quest faces.

The engine adapter uses `BLACK_SERPENT_HOOKS`; focused native tests cover setup,
guarding, physical claims, stage gates, progress restrictions, virtual
engagement, encounter alternatives, shadows, event cancellation and save
mutation rejection. `scripts/browser-black-serpent.mjs` checks fresh/resumed
1–4-player standard/easy setup and native travel/combat/quest decisions at
1280, 390 and 320 pixels, plus every pinned printed face and artwork hash.
