# Raid on the Grey Havens — original rules

This import implements the original **The Grey Havens** deluxe scenario, standard `Q06.3` and easy `E06.3`, for one through four players. It is not the later revised campaign. Original recipes contain 30 / 21 encounter cards, two quests and six set-aside records including the rules reference. Captain Sahír and Na'asiyah use their enemy sides. The original scenario has no Círdan or Galdor objective allies or uniqueness replacement rule.

Sources: the checked-in `public/catalog.json` and `public/scenarios.json` DragnCards snapshots, cached original front/reverse card faces in `public/cards`, and the original [The Grey Havens rulebook, pp. 12–13](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf). The pending source bundle is `src/data/pending/raid-on-the-grey-havens-import.json`.

## Setup and quests

After all opening-hand decisions, setup places The Havens Burn, Dream-chaser and one Sahír's Ravager in staging, without revealing them. The shuffled encounter deck is discarded until one Aflame location per player has been found. Those locations are added without their When Revealed text; all other discarded cards return to the shuffled encounter deck. Both elite enemies remain set aside.

The Corsairs' Assault needs 18 progress. Its end-of-combat Forced effect deals damage equal to the number of Corsair enemies anywhere in play to an Aflame location with the lowest Aflame value; ties are decided by the first player.

Sahír's Advance adds both elite enemies. The first player orders their entry effects, including waiting Trap attachments and Fresh Tracks responses, before one card per player is revealed. Resources are then placed on each elite equal to the current damage on Dream-chaser, and one resource is added to every other Raider in play. The 2B revealed-Raider resource grant begins after 2A has finished. Afterwards, quest progress first fills the active location; remaining progress removes an equal amount of damage divided among locations. This quest effect can remove damage from the immune Dream-chaser. Victory requires Captain Sahír in the victory display and zero damage on every location in play. Na'asiyah need not be defeated.

## Aflame and fire

At the end of every round, each **staging** Aflame location takes one damage. Active locations receive no framework Aflame damage. Locations still receive damage from encounter effects wherever they are in play.

As soon as damage reaches the Aflame value, the physical location leaves play and is placed facedown underneath The Havens Burn. It is not explored, discarded or added to victory. Its attachments leave normally. The burned location's Forced text and The Havens Burn's reveal trigger are ordered by the first player. Burning Piers damages Dream-chaser; White Ship adds Raider resources; Elven Caravel damages every character. Dream-chaser burning loses the game. The Havens Burn reveals a card and loses the game when its destroyed-card count reaches the original number of players plus three.

Exploring a damaged location discards its damage along with the physical location. Victory locations still enter victory. Elven Wave-runner offers its optional response after reaching victory, allowing every player to draw one card.

## Corsairs, encounter effects and shadows

All shared Corsair Raiders are scripted in this module and available to the other original Grey Havens quests: Umbar Raider's resource-dependent attack and after-attack theft, Corsair Infiltrator's resource-phase theft and extra attack shadows, Raid Leader's resource-dependent defense and hero-resource transfer, and Battle-Hardened's Raider tokens and immediate non-Ship attacks. Transfers remove only available resources and do not count as resource spending. Multiplayer choices use the relevant player's heroes, hand and defenders.

Captain Sahír engages the first player and cancels one damage for each resource he can discard; excess damage is still dealt. After attacking he gains two resources, or four when combat damage destroyed a character. Na'asiyah engages the last player, discards that player's events and takes one resource per discarded event. Her attack and defense receive a snapshot of her resources for the current attack, then one resource is discarded afterward, including after a player attack against her. Both elite cards always go to victory when they leave as enemies and never enter the encounter deck/discard.

Arsonist searches the highest Aflame value in deck and discard; Pillaged Ship restores the topmost discarded enemy; White Ship searches a Corsair without revealing it. Caravel travel assigns and combines damage separately for each player before resolving damage events. Mithlond Harbor blocks staging-location progress. Dream-chaser's printed dash cannot receive progress and its text prevents travel.

Every printed shadow has a separate handler. Burning Piers' shadow moves the actual shadow card to staging, removing it from the attacking enemy's shadow pile. Fires Spread's after-kill shadow uses actual combat destruction, and remains cancelable through the normal shadow window. Test of Will cancels When Revealed text; Doomed, printed Surge and the stage-2 Raider entry token retain their normal timing. Conditional Surge is granted only by a resolving When Revealed effect.

## Persistence and verification

Save state preserves set-aside elite identities, every burned location, attack snapshots, character-kill flags, queued choices and shadow continuations. Validation rejects foreign burned cards and duplicate physical IDs. The scenario panel shows the destroyed-location count, round timing and the current quest's win condition.

`tests/raid-grey-havens.test.ts` covers real setup and gameplay actions, both modes and player counts, fire chains, travel costs, immunity/replacement progress, elite combat, resources, cancellation and reloads. All **28 semantic tests** passed. `scripts/browser-raid-grey-havens.mjs` passed **20 browser checkpoints** at 1440×1000 and 390×844 against the same production bundle, with no console/page errors, decoded local art and no horizontal overflow. It exercises setup, White Ship travel, burning-location ordering, actual round changes, stage-two elite entry ordering with Trap/Fresh Tracks, quest damage removal and victory, including pending-decision reloads. TypeScript checking passed. The reproducible browser report and screenshots are in `output/raid-grey-havens/`.
