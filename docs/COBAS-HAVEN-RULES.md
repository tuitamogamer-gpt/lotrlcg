# A Storm on Cobas Haven — original scenario rules

This implementation follows the original **MEC52** cards, together with the Sailing, Heading, Ship and Boarding rules in **MEC47**. It supports standard and easy mode with one to four local players. Source scans, checksums and transcription corrections are recorded in [COBAS-SOURCES.md](COBAS-SOURCES.md).

## Setup and separate physical piles

The normal recipe contains 65 physical cards after excluding the rulesheet proxy; easy mode contains 51. The primary encounter deck contains 33 normal or 23 easy cards before the setup objectives are incorporated. The independent Corsair deck contains 16 or 12 cards. Its discarded enemies return only to that deck, including the additional Corsair Raiders enemies.

Each player chooses one of the four original fleet objectives, and the fleet must contain Dream-chaser. A solo player controls Dream-chaser plus a second ship. The two Dol Amroth Warships remain aside until The Beacon recruits them. Heading is attached to Dream-chaser. Setup adds Raider Flagship and Scouting Ship, lets the first player select one of the four Dol Amroth objectives, shuffles the other objectives into the encounter deck and resolves the selected objective's Guarded keyword.

## Sailing and the three quest stages

All three stages use Sailing. The original card fronts determine their Sailing symbols; Sea-ward Tower adds two looked cards when unguarded and unblanked. Looked cards are not revealed, and their encounter effects do not trigger.

- **Outmaneuver the Enemy:** each Ship engagement deals two damage to that enemy while on-course, or to a Ship objective controlled by the engaged player while off-course. Raider Flagship's engagement cost falls by 50 at the worst heading.
- **Battle in the Bay:** search the encounter deck and discard for one Ship enemy, or two with at least three players, then assign non-unique staged Ship enemies to the unguarded objectives. Progress can accumulate, but the players cannot advance while any objective still has an encounter guard.
- **Break Through the Fleet!:** immediately perform engagement checks. Raider Flagship gets −50 engagement cost. The quest requirement is five plus five per Ship enemy currently in play. The players win by completing it or by having Raider Flagship in the victory display.

Raider Flagship's printed Forced effect occurs at the **end** of the encounter phase: its engaged player takes the top Corsair enemy. Its Boarding 1 remains separate. Only Ship objectives can attack it. Its defeat grants the printed 20 victory points; defeating it before the final stage does not skip earlier stages.

## Dol Amroth objectives and guards

The four objectives remain public in staging and are controlled by the players collectively when free of encounter cards. Each guard is the actual encounter unit, linked by physical ID, and continues to function in its ordinary staging, engagement or active-location zone.

- **Sea-ward Tower** adds two cards to each Sailing test.
- **Tower of the Heron** reduces the combined Archery total by four, with a floor of zero.
- **Tower of the Gull** offers its Combat Action to any player: exhaust it to deal two damage to a non-unique Ship enemy.
- **The Beacon** offers its Planning Action to any player: exhaust it and spend five resources from that player's heroes to take one set-aside Dol Amroth Warship. The player chooses the resource pools.

Siege Ship guards an unguarded objective at the end of the quest phase while it is staged and not already guarding. The Raiders' Assault can return an engaged, unassigned Ship to staging as a guard. It gains Surge unless an engaged Ship actually returned; assigning a ship already staged still resolves the Surge response window.

Heavy Cruiser searches for an objective and attaches itself as that objective's guard. If it was revealed as another objective's guard, it guards both objectives at once; defeating the one physical Cruiser frees both. This follows Caleb Grace's 27 April 2018 ruling (ALeP compilation §3.257). Its original `guarding` link and additional `cobasGuarding` links survive saves and appear on both public objectives.

An objective whose Guarded keyword is pending is not yet unguarded: its group benefits are inactive and it is not an eligible target for The Raiders' Assault or Siege Ship. When one Guarded objective reveals another, the original objective's guard resolves first, followed by the newly revealed objective's keyword. The pending objective cannot be selected by an Assault revealed during this sequence (Caleb Grace, 18 October 2016, §3.223). Serialized pending Guarded IDs preserve this timing across choices and reloads.

## Ships, travel and temporary absence

Dol Amroth Warship receives +2 willpower, attack and defense while on-course. If destroyed with its text active, the same physical card returns aside as a fresh game instance. Old modifiers and attachments do not follow it. Ordinary discard does not trigger that destruction-only destination. Its loss does not eliminate its controller; elimination is printed on the original fleet cards, not a generic Ship rule.

After an engaged Corsair Skirmisher is destroyed as an enemy, its player may select and discard allies totaling at least three current willpower. The same physical Skirmisher enters as a fresh Ship objective, with willpower equal to its printed threat. It retains its original card identity while its effective card type changes. It uses the Ship attack, defense and undefended-damage rules. Its later destruction does not eliminate its controller. The optional response may be declined, and the destroyed card remains serialized while the response is pending.

Coast of Anfalas gains two threat while off-course and requires exhausting a Ship objective to travel. Cobas Haven reduces Boarding by one while active, never below zero. Belfalas Islet requires on-course travel; its optional response makes one unassigned Ship enemy out of play while the Islet remains active. The actual enemy retains its ID, damage and former engagement, contributes no threat or final-stage quest points while absent, and returns when the location is no longer active. Phase and round modifiers expire during its absence. Belfalas has the printed Victory 1.

## Treacheries and damage timing

Taking on Water becomes a Condition attachment on a Ship objective. Each actual exhaustion of its host queues two damage. Its action selects three distinct characters controlled by the acting player and verifies they can all exhaust before paying the cost. Exhausting the attached ship as part of that cost still triggers its Forced damage. Its shadow moves that physical shadow card onto a defending Ship rather than duplicating the card in the encounter discard.

Ramming Speed! selects an engaged Ship with the highest current attack while off-course and starts a real immediate attack. The attack's identity survives defender declarations and supported damage replacements. Only damage actually dealt by that attack increases staging threat, and the increase expires with the real phase, treating staging as part of questing and defense/attacks as one combat phase. A prevented attack does not silently select a lower-attack enemy. When no attack is made, gained Doomed 2 uses the ordinary Doomed response pipeline.

Shared Voyage Across Belegaer, Umbar Fleet, Corsair Pirates and Corsair Raiders cards reuse their established effects, including Boarding resource placement, Raid Leader's engagement resource transfer, Corsair Infiltrator's resource and shadow effects, Umbar Raider's attack transfer, Cunning Pirate and Vicious Marauder, Fog Bank, Battle-Hardened and Boarding Party.

## Save and presentation boundaries

The save stores separate Corsair piles, physical set-aside Warships, objective guard links, Belfalas-held enemies and pending Skirmisher capture responses. Validation rejects duplicate physical IDs, invalid Corsair cards, inconsistent quest order, captured Ship flags outside allied zones and invalid Belfalas/guard links. Public views expose counts, revealed objectives and their visible guards without exposing private encounter or Corsair order.

`tests/cobas-scenario.test.ts` covers setup in both modes at all four player counts and the interactions above, with save/reload at pending decisions. Existing Voyage and Stormcaller semantic suites exercise the reused fleet rules. Browser and complete-game evidence is recorded in the release summary.
