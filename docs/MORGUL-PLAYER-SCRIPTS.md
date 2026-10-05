# The Morgul Vale player cards

The ten published player designs are registered under their original card codes
06134–06143. This does not enable The Morgul Vale encounter scenario or its
Nightmare variant. Published card definitions and printing provenance are in
`src/data/morgul-player-cards.json`.

## Rules and primary sources

- The original printed card text is preserved in the imported RingsDB snapshot;
  its per-card source links and printed image references are in the data file.
- [FFG FAQ 1.9](https://images-cdn.fantasyflightgames.com/filer_public/1d/bb/1dbb319c-6b1e-466e-9177-75a5857b5cfa/lotr_faq_19_printer_friendly.pdf): sections 1.08 (one response per physical trigger), 1.15 (Then), 1.38 (player attachment control follows its character host), and 1.55 (player-card lasting effects are calculated once).
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf): Cost, The word Choose, Event Cards, Ownership and Control, Restricted, Resource Match, and Timing of Ability Resolution provide the common rules.

No published Morgul-specific FAQ ruling was found for Lay of Nimrodel, Steed of
the Mark or Scroll of Isildur. Their behavior applies the printed text and these
general rules; FAQ 1.55 establishes the lasting-effect calculation rule rather
than a card-specific Lay ruling.

| Card                    | Implemented behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Théoden                 | Sentinel and a live +1 willpower aura for each hero with a printed Tactics icon, including himself and other fellowships. Gained icons do not qualify. Blanking Théoden removes his aura.                                                                                                                                                                                                                                                                                                                                                             |
| Pelargir Ship Captain   | Existing Gondor script offers the optional enters-play resource transfer. Its donor is a hero controlled by the Captain's controller; the different recipient can belong to another player.                                                                                                                                                                                                                                                                                                                                                           |
| Visionary Leadership    | Existing passive script requires a Gondor hero host and gives Gondor characters across the table +1 willpower while that host has at least one resource.                                                                                                                                                                                                                                                                                                                                                                                              |
| Spear of the Mark       | Requires a Rohan character, uses normal Restricted-slot enforcement, gives +1 attack ordinarily and +2 when attacking an enemy in staging. Each unblanked physical Spear contributes separately.                                                                                                                                                                                                                                                                                                                                                      |
| Forth Eorlingas!        | Existing Rohan script snapshots eligible physical Rohan heroes across the table when the event resolves, permitting their staging attacks for the current combat phase. Later trait gains or hero entries do not inherit permission; a granted permission survives later trait loss. Its timing, controller and attack restrictions remain in force.                                                                                                                                                                                                  |
| Steed of the Mark       | Requires a Gondor or Rohan hero. Each actual commitment queues one optional response per attached Steed; its controller spends one resource from the attached hero to ready that hero. Readying retains quest commitment. Existing readying prohibitions are respected. A Steed played by another player follows its host's controller while retaining its original ownership.                                                                                                                                                                        |
| Lay of Nimrodel         | Chooses a Spirit hero, including a hero with a gained Spirit icon or another player's hero. After paying the event's cost, its resource count becomes a fixed willpower bonus until phase end. Later resource gains/spending do not recalculate it. A legal pre-payment target remains the chosen target if the cost spends its last resource, resulting in a zero bonus.                                                                                                                                                                             |
| Ered Nimrais Prospector | Existing Dwarf script finishes the top-three discard before selecting recovery. Recovery requires all three discards; mining responses resolve separately and the selected card is shuffled into the deck.                                                                                                                                                                                                                                                                                                                                            |
| Scroll of Isildur       | Requires a Lore hero and discounts its play cost only for the controller's printed Lore heroes. Its action selects an actual Lore event in that controller's discard pile, preserves the event's normal timing and targets, chooses a legal full payment (including explicit X for Gandalf's Search), and discards the Scroll as its cost. The resolving physical event stays outside hand/discard during nested choices, then goes to that controller's deck bottom. Self-removing or victory-display events retain their own specified destination. |
| Hidden Cache            | Existing Dwarf script spends one resource to draw one card when played from hand and offers the separate two-resource response only after a real discard from deck.                                                                                                                                                                                                                                                                                                                                                                                   |

Existing Gondor, Rohan and Dwarf implementations are reused for the five already
registered designs; this pack does not duplicate their ability handlers.

## Verification

`tests/morgul-player-cards.test.ts` uses public engine actions to cover card
registration, attachment targets and Restricted decisions, actual attacks,
blanking, optional readying, Théodred funding, paid resource snapshots,
cross-player control and ownership, save/reload during response and replay
choices, fixed-cost and X event payments, targeted healing, physical duplicate
events, canceled effects and the reused scripts. Shared player-script suites
remain the broader regression evidence for the reused modules.

Scroll offers only the currently registered event pool and only events that are
legal at the present action window. Imported reference cards do not become
playable through the Scroll.

The focused semantic suite passed 24/24. `scripts/browser-morgul.mjs` also passed
against the local client at 1280×900, 390×844 and 320×750 with real target,
payment, commitment and response controls. Reloads preserved the Steed response,
Lay's fixed bonus, Scroll's explicit X and payment choices, and the selected
physical event through its nested search and bottom-deck placement. Targeted
healing also replayed through the Scroll. Screenshots are written under
`output/morgul/`; the run reported no console/page errors, horizontal overflow or
decision-dialog viewport overflow.
