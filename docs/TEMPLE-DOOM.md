# The Temple of Doom

This implementation covers the original **A Shadow in the East** adventure
(`Q09.3`/`E09.3`), normal and easy modes, Classic solo and one to four hot-seat
players. The menu uses the original printed title, **The Temple of Doom**;
the upstream catalogue omits “The”. The stable scenario identifier is
`temple-of-doom`. Printed difficulty is 7.

## Sources and physical setup

The [source audit](SHADOW-EAST-SOURCES.md) preserves the immutable upstream
preparation bundle and records corrections checked against the original
MEC77 insert and card scans. Normal setup has **37 ordinary encounter cards,
five separate Power of Mordor cards, two staged cards and five quest cards**.
Easy setup has **25 ordinary encounters**, with the other zones unchanged.
These totals match the independently checked original Normal/Easy quantities.

The four stage 2 cards and the five Power cards are independently shuffled.
Their hidden orders remain private in every public view and survive reload.
Tribute to Mordor and Thane Ulchor begin in staging. The initial Power
reveals retain their separate-deck origin for responses that require a
card revealed from the ordinary encounter deck.

The important transcription repairs include:

- The Forgotten Temple's **“Skip the quest phase”** instruction, absent from
  the upstream text, and its two end-of-planning resource counters.
- All four later quests are stage **2**, with goals 8/12/16/0 respectively;
  The Lord of Middle-earth adds four quest points per remaining player.
- Tribute to Mordor has **12 quest points** and Lost in the Dark has **8**.
- Twisted Tunnel's shadow discards exactly the top encounter card and adds it
  to staging if it is an enemy. Fearful Shadows' different shadow prevents
  the defending character from readying through the end of the round.
- Thane Ulchor has printed **9 hit points**, without player scaling.

## Quest and encounter rules

The first quest skips the entire quest phase. Its second end-of-planning
counter places it in the victory display and reveals the next stage 2;
the new stage's one-per-player encounter reveals finish before questing.
During that reveal sequence, side A remains displayed and cannot receive
progress; side B becomes active when the sequence finishes.
Defeating each of the next three stages moves that physical quest into the
victory display and advances through the original shuffled order. The final
stage cannot receive progress while four main quests are in the display.
The insert explicitly excludes **all side quests** from that stage count.

Memory of the Dark Years counts distinct types among its discarded encounter
cards. Shrine to Sauron discards the selected player's matching copies in
hand and under their control. The Lord of Middle-earth saves each player's
discard choice and enforces the combined progress allowance throughout the
round. The Legacy of Mordor saves the chosen hero's damage, exhaustion,
readying restriction and healing restriction until refresh begins.

Ulchor is immune and Indestructible. He cannot engage until four main
quests are complete. His Guards follow the player engaged with him. An
actual attack can reduce his remaining hit points to zero without removing
his physical card. Tribute cannot be selected as the current quest while he has hit
points remaining; defeating Tribute wins the game.

Tribute gains its end-of-round damage and removes exactly four counters
when its threshold is met, revealing one Power card. Running out of Power
cards alone does not lose: an attempted reveal from the empty Power deck
does. Every Power card has its printed behavior, including Khamûl's first
player engagement and combat restrictions, the Tower's threat deadline,
Watchful Eye's discard/draw triggers, Armies' lasting damage protection and
Covered in Darkness' per-player threat-reduction limit.

Lost in the Dark retains each actual player card under its owner's threat
dial. It discards one card per threat increase, regardless of the size of
the increase, and returns remaining cards to their owners' decks when
defeated. An eliminated player's held cards are archived with their other
discarded cards and cannot later repopulate their deck. Public data reports
counts without revealing faces or order.
After-engagement/draw/threat Forced effects are queued after the triggering
effect finishes: Faramir's engagement response deals its damage before
Armies of Mordor's new protection takes effect.

All location leaving effects cover both exploration and direct discard.
Crumbling Passage physically returns prior active locations to staging.
Narrow Opening counts each player's earlier plays in the same round.
Fanaticism retains its actual treachery identity as an attachment, chooses
among tied lowest-defense eligible enemies, and grants all printed bonuses
and immunity. The shared Easterling attachment, Raider, Warrior, Archery
and Warriors of the East rules use the common Shadow in the East module.
All native shadows are scripted, including phase-long defense and stacked
damage-on-kill effects.

## Verification

`node --import tsx --test tests/temple-doom.test.ts` passes **47 semantic
tests**. They include all eight normal/easy one-to-four-player setups,
native planning/quest transitions, hidden-state privacy, saved per-player
decisions, physical threat-dial cards, every special Power behavior,
location movement and leaving effects, an actual Ulchor attack victory
fixture, stacked attack shadows, and native Faramir/Armies timing.

The complete-game matrix is run with:

```sh
SHADOW_EAST_SIMULATION_SCENARIO=temple-of-doom \
  node --import tsx --test tests/shadow-east-simulation.test.ts
```

It runs normal/easy one-to-four-player games plus all three two-player
review modes, comparing actual final states, save restoration, physical
card conservation, rendering purity and hidden-state privacy.

The final matrix passed all 14 games: 2,040 actions and save checks, six
review-mode comparisons, 894 physical-card/rendering/idempotence boundaries
and 2,342 private player views. All seeded matrix games ended in loss; the
semantic suite separately verifies the native Ulchor/Tribute victory path.
The release evidence is saved in
`output/shadow-east-release/validation/temple-doom-games.log` and
`output/shadow-east-release/validation/temple-doom-semantics.log`.
