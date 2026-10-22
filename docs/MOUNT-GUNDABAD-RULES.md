# Original Mount Gundabad rules

Mount Gundabad (`mount-gundabad`) supports the original standard/easy recipes
for classic solo and one to four local hot-seat players. It is part of the
[original Ered Mithrin finale](ERED-MITHRIN-FINALE.md). The separate
[source audit](ERED-MITHRIN-FINALE-SOURCES.md) records original face scans,
immutable input hashes, insert corrections and the evidence behind these rules.
Revised campaign additions and Nightmare cards are outside this implementation.

## Quest and Caves decks

The Side Door is the opening stage. At the end of planning, the first player
looks at the top two quest cards and chooses one to put on the bottom. The
Side Door enters the victory display and the remaining top quest becomes
the current stage, showing its common 2A front.

Stage 2A flips at the **beginning of the quest phase**, as printed on the
quest cards and confirmed by designer clarification **3.306**. The original
insert's staging-step instruction is erroneous. Returning to a new 2A also
returns the same physical Dagnir to staging. There is no stage 3.

The selected 2B remains hidden until it is flipped or a printed look/reveal
effect permits inspection. The current-quest panel, printed-current-quest
inspection and public-state projection use one fixed 2A reference; its code,
art filename and reverse metadata cannot identify the selected hidden back.
The fixed complete card reference library remains available.

Defeating a quest places that physical quest in victory. Bypassing clears
its progress and puts it on the bottom of the quest deck with 2B facedown.
Progress can be placed on 2A, but does not survive the change to the
differently named B side (**3.386**). Foreboding Darkness and Throat of the
Mountain explicitly flip the chosen next quest immediately.

The Caves deck contains six Lost Caves locations, Dagnir's Hoard and Throat
of the Mountain: eight physical cards. Including the latter two corrects
the original insert omission, confirmed by **3.315**. The First Forge
begins set aside and is added by the Upper Levels defeat effect.

**Deep** replaces the location just traveled to with the top Caves card.
The replaced location is discarded to the encounter discard pile. This replacement
does not pay a second travel cost or reveal the replacement card. Effects
for becoming active still apply. Deep is ignored when the Caves deck is
empty. Forked Passage's optional after-travel response resolves first;
placing Forked Passage in victory does not erase the pending Deep effect.
If The Lower Deeps is defeated while another location remains active,
its chosen Caves location also becomes active. The old location remains
active; that quest gives no instruction to discard or return it. Both
locations follow the multiple-active-location rules in official FAQ **1.34**.

## Dagnir, Wormsbane and victory

Dagnir has X threat, seven attack, five defense and twenty hit points.
X is one plus the number of **all quest cards** in victory, including
player and encounter side quests. Dagnir is Indestructible and immune
to player card effects. Merely reaching twenty damage does not destroy her.

The ordinary damage cap is X per round. Dagnir's Wrath damage explicitly
bypasses that cap without consuming it. Dagnir's Slave separately prevents
non-quest damage. These restrictions use the physical Dagnir and survive
changes in engagement or quest stage.

With at least five quest cards in victory, Dagnir cannot leave staging
and is considered engaged with every player. That restriction does not
itself move an already physically engaged Dagnir; the next printed 2A
revelation returns her. Considered engagement does not produce a new
physical engagement trigger.

Wormsbane remains one physical objective on both faces. The First Forge
reforges it; its traits change from Broken to Reforged, rather than its
card type changing to attachment. Losing its bearer loses the adventure.

The Great Worm's optional response wins after a player resolves an attack
against Dagnir with no hit points remaining, provided that player controls
Reforged Wormsbane. The response itself does not require five victory
quests. At the end of combat, the stage must be bypassed with four or
fewer quests in victory. With at least five, The Great Worm grants no
optional bypass; players remain there until they win or another effect
moves them.

## Timing, attacks and damage

- The quest effects that say “after characters are committed” wait until
  every player has finished committing (**3.348**).
- Dagnir's Wrath produces real attacks. The first player chooses the order
  when several players are attacked (**3.307**). The same simultaneous
  timing principle applies to Wilderland's Bane. Dagnir's Hoard explicitly
  uses player order instead.
- A considered-engaged enemy attacks each player during that player's
  normal enemy-attack step and receives a **fresh shadow for each attack**
  (**3.346**). The same physical enemy does not reuse a prior player's
  revealed shadow. Shadow cancellation and discarded cards preserve their
  normal physical destinations and response windows.
- Assigned damage cannot exceed each character's available hit points,
  including when the character can subsequently prevent that damage
  (**3.263**, concerning Biting Wind rather than Archery).
- Mandatory quest-defeat effects resolve before optional responses to
  that defeat. The physical defeated quest retains the information needed
  for its pending responses; changing the current quest does not redirect
  an old effect onto the replacement.

These numbered references are designer answers reproduced by the community
FAQ compilation, distinguished from the original printed inserts. Complete
questions and answers are archived with the source audit; optional community
balance changes are not silently applied.

## Data and verification

Runtime recipes retain the corrected original inventories: standard has
41 main encounter cards and easy has 30, plus the eight Caves, First Forge,
two initial staging cards and eight quests. Easy restores the two
Wilderland's Bane copies omitted by the immutable source recipe.
The native quest title is **Frenzied Warrens**; every main quest and the
First Forge, Dagnir's Hoard and Throat of the Mountain has Victory 1.

State and physical zones are saved in `mountGundabad`; pending choices,
damage assignments, quest flips, immediate attacks and guarded player cards
survive reload. Hidden decks are represented by counts in public state.
The implementation is in `src/game/mount-gundabad.ts` and its support/types
files; promoted definitions and recipes are in `src/data/mount-gundabad-*`.

Run `node --import tsx --test tests/mount-gundabad-scenario.test.ts` for the
source, semantic, multiplayer and save regressions. The seeded standard/easy
matrix is `ERED_SIMULATION_SCENARIO=mount-gundabad npm run test:ered-simulation`;
client verification is included in `npm run test:browser-ered-finale`.
