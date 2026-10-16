# Race Across Harad

The original Adventure Pack scenario is implemented for 1–4 players in standard and easy mode. Its difficulty is 6. It uses the Race Across Harad, Desert Sands and Mordor Orcs encounter sets. See [source verification](RACE-HARAD-SOURCES.md) and [player rules](RACE-HARAD-PLAYER-SCRIPTS.md).

## The two quest decks

The players and Orcs each have four separate physical quest cards. Setup gives each player one Tamed Mûmak, removes unused copies, reserves River Harnen and one Uruk Warg-Rider, and places Uruk Chieftain in the Orcs’ area. Each player chooses a differently named location from the encounter deck. The players then advance to Racing North and choose whether the reserved Warg-Rider enters staging or the Orcs’ area.

When the main quests have matching names and stage numbers, cards in the Orcs’ area contribute to staging threat and can be engaged or traveled to. Their physical identities retain an area marker while they remain there. When the players move ahead, the remaining marked cards return to the separate area. Engaged enemies and active locations have left that area and stay with the players. Cards in the separate area are immune to player card effects and cannot leave it.

At the end of the quest phase, the Orcs discard the top encounter card and place its threat plus the threat in their area on their own quest. At stages 2D and 3D, Uruk Chieftain first returns to their area. Stage 4D instead counts all engaged enemies. Orc progression discards excess progress, resolves the next C side, and immediately updates which cards count as staging. The players lose if the Orcs defeat the players’ current stage 2 or 3, or defeat Orc stage 4.

## Mounts, progress and the river

After characters are committed, the current main quest receives at most 5 progress that round, or 10 if every Tamed Mûmak in play committed. The saved cap records actual progress already placed and applies across separate progress effects. Tamed Mûmak is immune to player effects, receives its controller’s undefended attack damage, and eliminates its controller if it leaves play. Other players can continue.

Stage 3 searches the physical reshuffled encounter deck for an Orc. Stage 4 also adds the reserved River Harnen. The river requires 20 main-quest progress before travel, reveals one encounter card per player as its Travel cost, and prevents victory while it remains in play. Its exploration and defeat of player stage 4 win the game.

Uruk Chieftain cannot take damage at player stages 2 and 3, or while River Harnen is in staging at Orc stage 4. The existing Mordor Orcs implementation supplies its other-Orc protection, forced engagement, Uruk defense restriction, Warg-Rider attack bonus, Mordor Warg and Fear of Mordor.

## Encounter effects and physical cards

Racing Warg attaches its original physical card to a chosen Orc, including an Orc in the separate area. Its four bonuses stack with Mordor Warg. When its host leaves play, the same Mount card returns to staging exactly once. Uruk Pursuer and Harad Road enter the Orcs’ area when revealed. Pursuer gains surge only while the two sides are at different stages. Its shadow becomes an actual engaged enemy and fires engagement responses while preserving later shadow cards.

Howling at their Heels records the remote Orc threat for the current phase, or adds one threat to every enemy when the parties share a stage. Pursuers from Mordor discards real encounter cards until an Orc is found. Its shadow and the final player quest add Orc progress only after an actual attack destroys a character. Harad Road returns its attacker to the Orcs’ area after the attack.

Blistering Erg uses the main quest’s stage number for X. Its damage, Expanse’s threat increase, Towering Dunes’ extra revelation and Desert Oasis’ exhaustion use actual travel entry hooks. Towering Dunes also blocks staging progress on other locations. Shared Desert Sands choices reuse the original physical exhaustion, damage assignment, Sandstorm, healing and readying continuations. Find Water prevents player effects from readying characters until defeated.

## Verification

The focused suite passes **55 tests**, covering all eight setup combinations, both independent quest chains, pursuit and caught losses, native progress and river victory, physical Mount and shadow moves, shared encounter continuations, controller elimination, saved choices and corrupt-state rejection. A native Uruk Pursuer shadow also proves the Steed of the North engagement response fires after the exact shadow card enters play. Separate placement and cancellation regressions distinguish When Revealed instructions from ordinary put-into-play effects.

Browser fixtures rehearse native commitment, revelation, travel, quest resolution and combat before the final production build is frozen. The final responsive browser suite passes **219 checkpoints**: 73 each at 1280, 390 and 320 pixels, including all 36 original scenario faces, native Orc pursuit convergence and loss, river victory, and save/reload at native decisions. Every original face is also decoded and its HTTP body checked against the pinned SHA-256. This run uses the frozen production module `index-CPSWsB-7.js` (328,197 bytes; SHA-256 `27fca54fbc11026802b5d8a64b182cfcc6a85652d2642b8e85527ae45d6d1cbc`). Its report is generated at `output/race-harad/report.json`; preliminary rehearsals are excluded from the final counts.

Run `node --import tsx --test tests/race-harad-scenario.test.ts` for focused rules checks. Run `npm run smoke:race-harad` against a production build for responsive browser verification.
