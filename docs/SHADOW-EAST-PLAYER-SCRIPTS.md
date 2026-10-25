# A Shadow in the East player scripts

This original deluxe adds thirteen player designs, including the two-sided
Sméagol and Fellowship contract. Stinker is an associated two-copy encounter
card, and `21072.B` is the reverse of the same physical Sméagol card, not an
additional card design. Original scans and corrections are recorded in
[the source audit](SHADOW-EAST-SOURCES.md).

| Card                | Implemented behavior                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The One Ring        | Physical setup selection before opening hands; the first player chooses which player's copy enters play, other copies are removed; eligible bearer selection; saved Master search; Restricted, non-Master immunity, controller's elimination level reduced by five and group loss when it leaves play.                                                |
| Frodo Baggins       | Optional commitment response spends from Frodo's pool, readies another unique committed character, including another player's, and reduces the initiating player's threat if that quest succeeds.                                                                                                                                                     |
| Merry               | Optional entry response gives the unique allies controlled at resolution +1 willpower for that round; later entrants do not inherit the effect.                                                                                                                                                                                                       |
| Pippin              | Optional readying after engaging an enemy above the controller's threat; conditional +2 attack is computed against the actual attack target.                                                                                                                                                                                                          |
| Faramir             | Optional entry response engages an eligible non-unique staging enemy and deals two damage, or four when it has an attachment. The complete response's damage precedes queued subsequent enemy attacks.                                                                                                                                                |
| Derufin             | Ranged; after an actual attack destroys an engaged enemy, an optional discard cost reduces the engaged player's threat by the enemy's printed threat.                                                                                                                                                                                                 |
| The Gathering Storm | Searches only the top five encounter cards, adds the selected enemy without revealing it, shuffles, and discounts the first ally played that phase.                                                                                                                                                                                                   |
| Put Off Pursuit     | Attaches only to an active location, once per location; adds two quest points; exploration response discards until a location, adds it to staging, then shuffles an eligible non-unique staging enemy into the encounter deck. Ordinary removal dispatches captured-card and guarding consequences.                                                   |
| The Master Ring     | Only the Ring's controller can pay its exhaust/threat cost. The response cancels a newly revealed card before its keywords and revealed effects, discards it and reveals one replacement for the original revealing player. An explicitly uncancelable card remains uncancelable.                                                                     |
| The Ruling Ring     | Combat-only Master action prevents the chosen non-Nazgûl enemy from attacking the initiating player for that phase.                                                                                                                                                                                                                                   |
| The Ring of Power   | Master cost readies the physical bearer and grants +1 willpower, attack and defense until phase end.                                                                                                                                                                                                                                                  |
| Sméagol / Gollum    | Adds exactly two Stinkers after scenario encounter recipes are initialized. Actual travel offers threat-for-draw. Stinker preserves physical identity while replacing the hero with ready Gollum, removes tokens and follows the first player. Combat defeat returns exhausted Sméagol to his original owner. Gollum ignores non-Gollum card effects. |
| Fellowship          | Kept outside the draw deck and the fifty-card minimum; starts on A. Non-unique allies cannot enter. Exactly nine unique characters flips B, adds the three stat bonuses and bars further ally entry. A companion leaving flips back.                                                                                                                  |

All player decisions and extra physical zones are serializable. Setup choices
retain their continuation before scenario initialization. Effect ownership is
explicit in multiplayer; Master cancellation preserves the revealing player,
and Derufin distinguishes the attacking fellowship from the engaged fellowship.

## Source-specific timing clarifications

The original MEC77 insert supplies the special Ring, contract and Sméagol rules.
Core rules page 25 states that attachments change control with their character,
so the Ring controller, Master access and elimination reduction follow an actual
change of its bearer's control. This is tested as a physical control transition;
the separate Saga event Desperate Alliance is not registered by this import.
The source audit also preserves the compiled designer correspondence separately
from publisher-issued rules and FAQ:

- Caleb Grace's April 2020 answer (3.354) confirms that the Ring's Master search
  occurs before drawing the opening hand. His mulligan answer (3.264) states
  that only the six opening cards are mulliganed. The searched Master therefore
  retains its physical identity through a mulligan.
- His Sméagol answer (3.333) permits a fellowship whose last hero has flipped to
  Gollum to remain in the game. Undefended damage has no hero recipient while
  that condition lasts.
- His Faramir answer (3.327) confirms that an engaged Easterling Outrider takes
  the response's damage before its resulting immediate attack resolves.
- His Sacked! answer (3.330) preserves the absolute prohibition on cancellation.
  The later side-quest answer (3.395) describes the intended whole-card
  cancellation of an encounter side quest; it is a qualified designer-intent
  clarification, not a new publisher FAQ.
- Official FAQ 1.54 treats a canceled whole card as never revealed. Master Ring
  therefore does not report cancellation of an initiated When Revealed effect
  to Exposed Riverbank; this application is a rules interpretation, not a
  separate designer ruling about Riverbank. FAQ 1.56 also requires Sméagol to
  discard attachments as soon as his previously blanked restriction returns.

Sméagol cannot be selected for the Shadows of Mirkwood adventures. Saga content
retains its separate support status; the original insert also prohibits Sméagol
and Master cards there.

## Verification

`node --import tsx --test tests/shadow-east-player.test.ts` currently passes
33 semantic tests. They exercise actual card plays, response decisions, attack
kills, travel, exploration, reload, multiplayer ownership, the two Ring-copy
setup choice, the six-card mulligan, contract transitions, both Sméagol faces,
Stinker shadow conservation, cancellation timing and malformed save rejection.
The separate shared integration and browser suites provide additional evidence;
the final release report records their completed results.
