# Escape from Mount Gram

Original normal and easy recipes support one to four fellowships. Printed card
faces and the original FFG rules insert are the authority:

- [Original rules insert](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec40-escape-from-mount-gram-rulesheet.pdf)
- [Original face snapshot](../src/data/pending/escape-from-mount-gram-import.json)
- [Semantic tests](../tests/mount-gram.test.ts)

The setup returns the kept or mulliganed opening hand to the deck before building
each player's captured deck. Allies and Item, Mount and Artifact attachments are
removed, with the unchosen starting heroes added as described in the insert. A
physical captured card keeps its identity and owner while its face stays hidden.

Capture resolves whenever the host enters play, before its When Revealed text.
Each private dungeon has its own physical quest, staging area and active
location. Encounter deck and discard remain shared. Cross-player targets and
multiplayer encounter instructions use only players in the current dungeon.
Progress on the main dungeon rescues random prisoners after the active location
absorbs progress and finishes its exploration effects. Captured heroes return
directly to their owner's play area; other rescued cards enter their owner's
hand. Prison Cell's explicit inspection Response puts one captive into play;
this transfer does not count as a rescue.

Completed dungeons join in global first-player order at the beginning of travel.
Joining transfers staging cards, preserves engaged enemies and discards the
former active location, rescuing its prisoners. A solitary eliminated player's
area is discarded rather than transferred (official FAQ 3.246). The final stage
adds the original physical Gate and Jailor, merges the nine Angmar Orc cards and
reveals once per surviving player.

Several source-catalog clauses differ from the printed faces and are corrected in
the runtime data: Flight from Mount Gram and Gate travel require **16** progress;
Goblin Tormentor has **Capture 1**; Cruel Torturer and Captives of Gornákh's shadow
capture an **ally**; Interrogation's shadow discards one random hand card and
raises threat by its printed cost; Dungeons reveals its searched Cell before
capturing two additional cards; Southern Gate has the Mountain trait. The four
setup Prison Cells listed in the catalog's staging section start in the encounter
deck so the printed stage-2 search can find them.

Sound the Alarm follows the encounter lasting-effect rule in official FAQ 1.55:
its modifier also applies to enemies that enter later in the round. Executioners
uses Time 4 in every private area; timeout discards prisoners without rescuing
them, removes the side quest from the game and charges each owner only for that
owner's discarded characters. The Jailor responds to a batch of rescued cards,
chooses the highest-threat local player (first player decides ties), then makes
an immediate attack before optional Dungeon Guard responses.

Interrogation processes each original participant's captured deck before its
conditional Doomed 2. This uses the normal Doomed response window; isolated
dungeons remain separate, and elimination of one joined player does not cancel
the remaining players' resolution. Cards captured from play also preserve their
physical destination for leave-play Responses such as Eagles of the Misty
Mountains.
