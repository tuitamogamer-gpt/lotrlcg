# Wrath and Ruin

The original MEC78 adventure is playable in normal and easy modes, in classic
solo or with one to four local players. Its printed difficulty is **7**. The
scenario uses Wrath and Ruin, Easterling Raiders and City of Rhûn.

## Original sources and quantities

[The source review](WRATH-RUIN-SOURCES.md) records the original insert, card-face
transcriptions, local images and independent normal/easy inventory. The promoted
scenario has **25 identities and 27 faces**: two double-sided quests and 23 other
identities. Its physical recipe contains **50 encounter cards plus two quests**
in normal mode, or **38 encounter cards plus two quests** in easy mode.

The upstream recipe omitted the single **Warriors of the East** side quest from
the Easterling Raiders set. The original insert requires that complete set, and
the independent card inventory confirms one copy in each mode. The promoted
recipes restore it; the immutable upstream snapshots retain their original
51/39 totals. Five printed shadow effects missing upstream were also restored.

## Capturing the city

Setup places Thane Ulchor and Gate of Dorwinion in staging. Each player chooses
a differently titled location, and a separate physical Makeshift Fortification
becomes active. Setup does not pay travel costs or resolve When Revealed effects.

Both quest stages prevent player-card progress on locations in staging. Their
exploration replacement gives the first player control of an explored location
instead of discarding it. Controlled locations remain in play with their printed
text, attachments and resources. Taking or losing control removes all progress;
returning a location preserves its physical identity. A player eliminated from
the game returns every controlled location to staging after the ordinary
attachment ownership cleanup.

Inside the Walls requires **4 + 4 per player** progress. It can advance only at
the end of the round, when the players control strictly more locations than are
in staging. Drive Them Out first resolves its A side: each player returns a
highest-threat controlled location, the encounter discard is shuffled into the
deck, then each player discards to an enemy and puts it into play engaged. The
saved A-side decisions finish before the B side becomes active.

Gate travel requires **12 progress on stage 2B** and strictly more controlled
than staged locations. Thane Ulchor attacks every player in turn order as its
travel cost. Exploring the Gate captures the original physical card instead of
placing its Victory 5 in the victory display. Controlling it wins only at the
end of the round. Ordinary threat and hero-elimination losses remain active.

## Printed encounter behavior

- Thane Ulchor remains in staging, is immune to player cards, and offers a
  location search or an attack after an active location is explored. The Gate's
  threat is one plus the number of locations controlled by all players.
- Contested Square gains encounter progress after actual enemy destruction and
  returns when its controller's character is destroyed. Ransacked House pays
  its encounter-action engagement cost, including mandatory effects, before
  control changes; losing another location cascades its return effect.
- Capturing Makeshift Fortification returns the topmost discarded enemy to
  staging. Capturing Captured Tower shuffles the discard and engages the first
  discarded enemy. Tower prevents When Revealed and shadow cancellation only
  while active; Fortification contributes its active-location Archery 3.
- Champion of Rhûn offers the engaged player a real return-or-attack choice.
  Easterling Skirmisher's character-destruction effect follows that character's
  controller, including a remote Sentinel defender.
- Fury attaches to an eligible lowest-engagement Easterling. Its destruction
  replacement discards Fury and heals the enemy before defeat responses, Square
  progress or victory processing can occur. Discarding an enemy without
  destroying it does not invoke Fury.
- Caught Off Guard, Street Fighting and Ulchor's Revenge resolve each actual
  player's controlled locations. Under Siege snapshots its threat bonus for the
  current phase. The five original shadows use real defenders, actual damage,
  fresh additional attacks and the attacked player's location count.
- The shared Raiders, Warriors, weapons, Backstabber, Treacherous Easterling,
  City Forum, Seedy Tavern and Darkness rules retain their original behavior.
  Put-into-play-engaged effects trigger in-play and engagement rules without
  consuming staging-only Traps. Warriors of the East receives its actual entry
  attachments and current-quest attack.

## Timing, private information and saves

Explored locations occupy one pending physical zone while simultaneous When
effects resolve. The first player chooses the order of capture, Seedy Tavern's
stored-card reveal and The Burglar's Turn's loot claim. Forum and Ulchor After
effects follow those When effects. Capturing first can change Street Fighting's
damage; revealing first can eliminate the original first player, in which case
the current first player receives the explored location and cleanup still ends.

Seedy Tavern's travel cost stores the top five cards privately until its player
chooses one. Pending public choices contain neutral numbered labels, while the
actual choosing player can inspect card art. The public scenario view exposes
hidden-pile counts and public controlled locations, without stored-card identity
or order. Saved private state retains the physical cards, owner-specific choices,
pending attacks and continuation order.

The save validator checks scenario stages, owners, counters and physical zones.
Controlled locations are part of the ordinary in-play target collection;
pending, stored, resolving and looked-at cards are counted exactly once by save
and inventory checks. Controlled locations can receive progress and be explored
again without duplicating the physical card.

## Verification

```sh
node --import tsx --test tests/wrath-ruin.test.ts
node --import tsx --test tests/wrath-ruin-integration.test.ts
npm run test:wrath-ruin-simulation
npm run test:wrath-ruin-quests
```

The native scenario suite covers setup in both modes at one to four players,
classic solo, saved A-side and exploration decisions, end-round advancement and
victory, native travel and House costs, all five new shadow effects, real Fury
replacement, remote ownership, private Tavern choices and elimination cleanup.
Separate integration coverage exercises Captured Tower against actual player
cancellation abilities, Fury against player kill responses, cross-pack threat
effects, physical inventory and Burglar loot ordering. Simulation and browser
release totals are recorded by the release verification rather than inferred
from these isolated rules fixtures.
