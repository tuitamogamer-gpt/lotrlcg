# Conflict at the Carrock rules support

The original standard and easy-mode quest is automated. Its Nightmare variant is imported for reference and is not covered by this implementation.

## Sources

- [FFG Conflict at the Carrock rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/rulesheet-conflictatthecarrock.pdf), downloaded and visually verified on 2026-09-30. This scanned sheet confirms difficulty **7**, the three encounter sets, the normal Sacked! setup, The Carrock's immunity, Grimbeorn's transition into a controlled ally and his encounter-discard destination when leaving play.
- [FFG FAQ 1.9, printer-friendly](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf), pp. 11–12: a hero already committed remains committed after receiving Sacked!; Against the Trolls is the final stage; Legolas cannot place progress on either an immune active location or the quest behind it. Section 1.25 explains that preventing resource collection also prevents resource gains through card effects. The general immunity rules also prevent selecting an immune card as a player-effect target.
- [FFG Easy Mode](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_easy_mode.pdf), explicit Carrock example: remove 16 gold-symbol encounter cards before following normal scenario setup. Removal counts are Massing at Night 1, Gladden Fields 2, Hill Troll 1, Marsh Adder 1, Despair 2, Muck Adder 2, River Langflood 2, A Frightened Beast 2, Sacked! 1 and Roasted Slowly 2.
- Printed card definitions and UUIDs are preserved from the full catalog's pinned OCTGN / DragnCards source snapshots; see [CONTENT-IMPORT.md](CONTENT-IMPORT.md). The 13 original Carrock encounter designs are in `src/data/carrock-encounter-cards.json`; both quest faces are in `src/data/carrock-quest-cards.json`.

## Implementation details

- Setup removes the four unique Trolls and The Carrock, stages The Carrock, removes four Sacked! cards, then adds one Sacked! per player. The resulting encounter deck contains `44 + players` standard cards or `28 + players` easy-mode cards. Standard retains `1 + players` Sacked!; easy retains `players`.
- At seven stage-one progress, the previous active location is discarded without exploration effects, The Carrock becomes active and the four unique Trolls enter staging. Stage two requires one quest progress and no Troll enemies in play, including Core Set Trolls.
- Troll attack/defense auras and River Langflood's threat count all seats. Louis's threat increase applies to the defending player after an actual Troll attack, and Rupert returns discarded Sacked! cards after attacking. Each unique Troll's defeat offers an optional Sacked! removal response.
- Sacked! is never offered cancellation. It prevents new quest commitment, attacks, defenses, the hero's own triggered effects and all resource collection, including gains from Steward of Gondor, Horn of Gondor and other card effects (FAQ 1.25). Existing quest commitment remains effective. Attachment actions with legal effects, such as Unexpected Courage, and spending existing resources remain available.
- Grimbeorn's resource action uses current Leadership icons, including Song of Kings and Sword that Was Broken, or any hero pool while Oak-wood Grove is active. Eight resources claim him for the player who is first at that moment. The rulesheet treats this as a transition into an ordinary controlled ally, so passing the first-player token does not transfer him. His objective-ally card type remains preserved. He stays ready when defending a Troll and leaves play into the encounter discard pile.
- Bee Pastures offers an optional search of the encounter deck or discard and shuffles the deck after searching. A Frightened Beast offers any player a Creature-ally sacrifice to cancel the threat increase for everyone. Roasted Slowly destroys Sacked! heroes and shuffles itself into the deck; cancellation discards it normally.
- Muck Adder discards a surviving character only after dealing positive combat damage. Its shadow reduces each defender's defense by one for that attack, never below zero. Sacked!'s Troll-only shadow removes the actual shadow copy before attaching it; Roasted Slowly's shadow heals only attacking Trolls.

## Verification

`node --import tsx --test tests/carrock.test.ts` exercises real game actions and queued effects, including 1–4 player normal/easy setup, stage transitions, immunity, cross-seat auras and threat, Sacked! restrictions and cancellation, Grimbeorn's payments/control/save lifecycle, travel search, every new treachery and shadow, and defeat/attack responses.
