# Khazad-dûm scenario rules support

The original Into the Pit, The Seventh Level and Flight from Moria recipes are scripted in normal and easy mode. Their Nightmare additions remain reference content pending their own scripting and verification.

## Sources

- [FFG Khazad-dûm rules](https://images-cdn.fantasyflightgames.com/filer_public/de/40/de405784-33a0-4ce4-bff8-e281a3a99fc8/khazad_dum_rules.pdf): encounter-card actions are available to any player. East-gate cannot be displaced by card effects. Cave Torch leaves the game when detached. Book of Mazarbul can transfer by exhausting its new bearer. Flight from Moria uses a shuffled seven-card route deck; routes normally turn over when staging begins and may be bypassed after combat.
- [FFG Easy Mode](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/support/easy-mode/LOTR_Easy_Mode.pdf): the reduced encounter quantities are stored separately from printed quantities. After scenario setup and before initial reveals, Into the Pit has 50/33 cards and The Seventh Level has 34/26 cards (normal/easy). Flight from Moria has 46/31 cards plus one A Foe Beyond per participating player.
- [FFG FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf): section 1.34 supplies singular-active-location choice when several locations are active; 1.42 discards previous shadows before an additional attack; 1.43 continuously recalculates variable stats.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf): reveal versus placement, player elimination, costs, forced effects, damage, progress, lasting encounter effects and printed X costs supply shared timing rules.

## Implementation

The fixtures preserve all 50 encounter designs and 13 double-sided quest designs, including exact printed names, stats, card images and source identifiers. Misty Mountains cards are included for the subsequent Dwarrowdelf quests. Reverse-side quest victory values retain the source import's corrected values; Heading Up, Heading Down and Narrow Paths are each worth one point.

Into the Pit checks Bridge of Khazad-dûm in the victory display before advancing, makes every surviving player search for an enemy, ensures a Patrol Leader is selected when available, and blocks resource-phase income during its final stage. The Seventh Level removes Book at stage two and resolves only enemies from the extra staging draw, preserving their actual revelation triggers.

Flight uses a saved physical quest deck and current side rather than a linear approximation. Its implementation includes all seven route outcomes, forced route replacement, player-by-player Blocked by Shadow risk, Hasty Council's resolution order, Narrow Paths' willpower restriction, opposite-heading recycling, guarded Tools, and the special refresh progress action for Escape from Darkness. The Nameless Fear tracks victory changes and encounter modifiers immediately.

Encounter rules distinguish searched or placed cards from revealed cards. They cover attachment costs and transfers, immunity, optional and automatic engagement, per-player choices, conditional surge, resource and hand/deck discard, variable stats, location exploration rewards, multiple active locations, physical shadow movement, additional attacks, and combat damage cancellation. Lightless Passage protects the attacker from combat damage; it does not protect the defending character.

## Verification

`tests/khazad-dum.test.ts` exercises all three recipes, 1–4-player setup, objectives and restrictions, original encounter rules and shadows, every Flight route, eliminated-player continuation, save/reload, staged Ranged attacks and damage cancellation. `tests/simulation.test.ts` exercises complete seeded games and parity between ordinary, guided, hidden and decisions review modes. The integration task maintains browser and whole-suite checks.
