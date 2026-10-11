# The Thing in the Depths — original scenario rules

The playable import follows the original MEC49 adventure pack, not a Nightmare or revised campaign variant. It includes standard `Q06.5` and easy `E06.5` recipes, all three quests, the two physical faces of each Captain, and all encounter and shadow effects for one to four players. [Source and artwork provenance](DEPTHS-SOURCES.md) records the original card scans and the official rulesheet.

Official rulesheet: [MEC49](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec49_rules.pdf), SHA-256 `48c07078e3cb7f1b99edd5f79a2840957fa07c159d3ebe6423e5e18fa180435d`. The additional-attack shadow behavior follows FAQ 1.9, section 1.42. This scenario does not use Sailing, a fleet, Boarding, or Massive.

## Physical setup and quest transitions

After all opening hands are kept, Helm of the Stormcaller and one Umbar Raider enter staging. The main encounter deck contains only The Stormcaller and Corsair Raiders sets. The Thing in the Depths encounter set remains in a separate hidden pile; the boss and both enemy Captains are set aside. Standard mode has 20 cards in the main encounter deck and 18 in the beast pile. Easy mode has 13 and 16 respectively. Both modes have the same two staged cards, three set-aside units and three quests.

At **Take the Ship!**, both enemy Captains gain Indestructible. Damage can remain on an indestructible Captain; destruction cannot remove it. At the end of each round, both set-aside Captains gain one resource only if neither is in play. Progress on this stage is blocked until Helm is in the victory display. Helm gains one quest point per resource on a Raider enemy in play, is immune to player card effects, and brings both enemy Captains into staging when it becomes active.

Completing the four-progress first stage resolves **Change of Plans** as a physical transition. Both Captains flip on their original unit IDs, damage/progress/resource tokens are cleared, and their objective-ally faces enter the first and last player's control. Every Corsair Raiders card is removed from the encounter deck, discard pile and play areas, including physical shadow copies and attached copies. Player attachments discarded as their hosts leave remain in their owners' discard piles. The boss enters staging; the remaining discard pile and the hidden beast encounter set are shuffled into the encounter deck. No new physical Captain copies are created by the derived `:B` display definitions.

**Defend the Ship!** discards until one more Tentacle than the number of players has been discarded, then resolves those enemies' Grapple keywords. Its back has no numerical quest-point requirement. Main-quest progress does not itself win or advance the final stage. Victory requires destroying the boss.

## Grapple

Grapple resolves immediately on reveal or when another card instructs the players to resolve it. The specified comparison uses printed values:

| Enemy         | Staged location criterion    |
| ------------- | ---------------------------- |
| Thrashing Arm | Lowest printed threat        |
| Crushing Arm  | Highest printed quest points |
| Grasping Arm  | Highest printed threat       |
| Giant Arm     | Lowest printed quest points  |

The first player chooses among tied locations. If there is no staged location, the enemy enters ordinary staging. Otherwise the full physical enemy is attached facedown to the chosen location, outside staging. Each attached enemy adds exactly two threat to its host. Its own enemy threat contributes nothing separately. It cannot be engaged or affected by player card effects, and the UI exposes only a card back and count.

A grappled enemy detaches when its host becomes active or when its staged host is explored. It flips faceup and enters staging on the same unit ID, receiving ordinary staging-entry responses. The first player can order multiple simultaneous detachments. A Crushing Arm's detach Forced effect then makes an immediate attack against the first player. Discarding a host without exploring it discards its attached enemies; this does not destroy a Creature and does not damage the boss.

The `grappled` and `pendingEnemies` zones preserve physical cards through tie choices, entrance responses and after-attack shadow choices. Save validation rejects a hidden enemy duplicated into a public zone, malformed host references, and invalid quest/pile partitions.

## Captains

Enemy Sahír must engage the first player. Each point of damage he would take discards one of his resources and cancels that point, until no resources remain. After a completed attack he gains two resources, or four if that attack destroyed a character. A prevented or abandoned attack grants none.

Enemy Na'asiyah must engage the last player. Her engagement discards that player's events and grants one resource per discarded event. At the start of an attack in which she attacks or defends, her current resources grant attack and defense for that attack. The bonus then expires and one resource is discarded. Other effects that last through the combat phase remain separate.

Objective Sahír has printed 0 willpower, 0 attack, 2 defense and 5 health. His resources add willpower and attack, capped at +6 each. Objective Na'asiyah has 1 willpower, 2 attack, 2 defense and 4 health. Each Captain's hero-resource Action uses the printed **spend** cost, observes spending restrictions, and can be used once per round. Effective heroes created by Sword-thain qualify. Na'asiyah can also spend her own resources repeatedly while attacking or defending for +2 attack or defense for that attack. Serialized combat action windows allow these payments before shadow/damage resolution; the modifiers expire when that attack ends.

Control follows the current first and last living players. Either objective ally's active printed leave-play clause causes immediate defeat, including removal through controller elimination. A blanked leave-play clause does not trigger; save state preserves that exception and removes it when the companion returns with active text.

## The creature and combat

The Thing in the Depths is immune to player card effects, cannot engage, and gains three health per player in the game. Destroying any Creature enemy deals boss damage equal to that enemy's last known current threat. This snapshot is taken before attachments and modifiers disappear. The Creature fully leaves play before this Forced damage resolves, and the Forced effect resolves before optional destruction Responses such as Secret Vigil, following FAQ 1.09 and 1.37. Discarding a Creature does not trigger the damage. Destroying the boss at the final stage wins immediately.

Eye of the Beast cannot attack. Each engaged Eye causes a separate boss attack against its engaged player during combat. Lashing Tentacles likewise makes boss attacks in turn order, and its shadow starts a boss attack after the original attack. Each additional attack receives its own fresh shadow; previously dealt shadows do not replace that fresh card.

Grasping Arm's forced exhaustion precedes actual defender declaration, for normal and immediate attacks. Giant Arm gets +2 attack against allies, including objective allies. Thrashing Arm deals three damage to one character controlled by its engaged player at the end of combat.

Giant and undefended Grasping shadow effects move the currently resolving physical shadow card, not the attacking enemy and not an earlier same-code shadow. Grasping's Grapple occurs during shadow resolution. Giant's choice waits until the original attack has dealt damage, then either engages its attacked player with one newly dealt shadow or resolves Grapple. Simultaneous Giant and Lashing delayed effects receive a new first-player order choice at attack completion. These choices survive saving and conserve each physical card once. A boss's previously dealt shadow is physically discarded before its additional attack receives a fresh one, including a prior Quarter Deck shadow.

## Ship locations, treacheries and shadows

Weather Deck grants a separate Travel exhaustion cost to each other Deck location for each Weather Deck in staging; every player must be able to pay each cost. Crew Quarters adds one resource to every Raider card in play, including the recovered objective allies. Forecastle Deck searches deck and discard for a physical enemy, reveals it with all relevant keywords/effects, then shuffles the encounter deck. Cargo Hold adds one defense to enemies while active. Quarter Deck deals an additional shadow to each faceup enemy at the beginning of combat.

From the Depths discards exactly three cards and resolves each applicable Grapple; its shadow assigns one damage per grappled enemy among the attacked player's characters. Hold Steady exhausts characters with current defense one or less; its shadow discards a zero-defense defender, otherwise applying minus two defense for that attack. Weather's shadow exhausts an owned character; Quarter's shadow discards an attachment controlled by the defending player. Crew's shadow adds two attack; Cargo's adds two enemy defense until the end of the phase. The recovered printed Forecastle shadow adds one attack, or two if the defender has no resources.

Shared Corsair Raiders keyword, resource, engagement, attack and shadow behavior remains active throughout the first stage. Canceling a When Revealed effect cancels that effect, while printed keywords such as Grapple and Surge retain their own rules.

At the final stage, ordinary travel can replace the active location: the former active location returns to staging with its existing progress. Travel remains limited to once per travel phase. At the end of the round, any one Ship location with current total threat at least nine destroys the Stormcaller and loses the game. This includes Grapple modifiers and applies to staged or active Ship locations; the sum of different Ships is not this loss condition.

## Verification

`tests/depths.test.ts` exercises actual standard/easy setup, progress/travel/combat/actions, controller routing, cancellation, shadow timing, victory and defeat. `tests/depths-audit.test.ts` independently checks the printed rules, physical duplicate-shadow cases, hidden identities, elimination and save validation. Player-card and integration suites, seeded save/reload matrices, and the scenario browser script provide additional release checks; the release report records their final counts and immutable source/build evidence.
