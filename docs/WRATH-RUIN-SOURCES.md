# Original Wrath and Ruin sources

Checked 26 October 2026. This import covers **MEC78 Wrath and Ruin**, the first
Adventure Pack of the Vengeance of Mordor cycle: original normal/easy recipes
`Q09.4` and `E09.4`, all eleven player designs, and the printed original art.
It does not import a Nightmare or campaign variant.

## Printed sources

The [original MEC78 insert](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC78.pdf)
is an archived scan of the publisher's two-page insert, hosted by Hall of
Beorn. Both pages were visually read. It has **1,769,386 bytes**, SHA-256
`c20b96827e62190bdbbfdfbba23b3bccee69b5867626d5c429b69d45dfdb9b32`.
The printed difficulty is **7**. Its encounter-set instructions require
**Wrath and Ruin**, **Easterling Raiders** and **City of Rhûn**.

All **39 gameplay faces** were visually read: 27 scenario faces, including
the restored Warriors of the East, and twelve player faces, including both
sides of The Burglar's Turn. The scenario has 25 identities: fifteen from
this pack and ten reused from A Shadow in the East. The eleven player designs
include Thorin Stonehelm's original Wrath and Ruin printing, nine other
player designs including the Encounter ally Tom Bombadil, and the contract.
The physical pack inventory sums to **60 cards**: 29 player-side cards,
29 encounter cards and two quest cards. These are 26 designs and 29 faces
before adding the ten shared scenario cards from A Shadow in the East.

The art inventories are `tests/wrath-ruin-scenario-art.ts` and
`tests/wrath-ruin-player-art.ts`, with exact source URLs, local paths, byte
counts and SHA-256 hashes. The 27 scenario images total **2,923,962 bytes**;
the twelve player images total **863,490 bytes**. Every player pin was also
compared against a fresh download from its recorded original-printing URL.

Thorin's canonical RingsDB identity has the Limited Collector's Starter
printing as its primary pack. Membership is therefore selected through
`packs[]`, rather than only `pack_code`. The Wrath and Ruin printing uses
UUID `e6e32f1f-fca8-44cc-8e04-0eaf6361b929`; its image is stored separately as
`/cards/22001.WaR.jpg`. The existing `22001.jpg` is preserved. Thorin,
Soldier of Gondor, Pillars of the Kings and Silver Circlet reuse their
existing mechanics and canonical card identities.

## Immutable source snapshots

The preparation CLI ran before any runtime correction:

```sh
npm run prepare:scenario-import -- --recipe Q09.4 --download
```

| Immutable file                                | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                         | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                       | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`         | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/wrath-and-ruin-import.json` | `d36c0fbcccf4b5d040c45c73f72f3e0b50f9d5c033299c2b68c2b57c94a1bd61` |

The preparation bundle remains `pending-rules`: it is the immutable source
snapshot, not the runtime automation registry. It contains 24 identities
and 26 faces. Promoted definitions and recipes are separate files.

## Missing encounter card and quantities

The upstream normal and easy recipes omit **Warriors of the East**, the
fifth design in Easterling Raiders. The original insert requires that whole
set. Its printed encounter index is **11/11**, and the independent
[Hall of Beorn scenario inventory](https://hallofbeorn.com/LotR/Scenarios/Wrath-and-Ruin)
includes **one copy in both modes**. The promoted recipes restore that copy
in `sharedEncounterDeck`, and record the original totals and correction.
The original catalog, source recipes and preparation bundle remain unchanged.
The already verified original side-quest definition and artwork are reused.

All 25 independent normal/easy inventory rows are pinned in
`tests/wrath-ruin-source-quantities.json`. No other quantity correction is
needed. The source website also displays a Nightmare column; it is not an
additional published Nightmare recipe and is not imported.

| Recipe               | Encounter deck in recipe | Setup section | Quest cards | Total |
| -------------------- | -----------------------: | ------------: | ----------: | ----: |
| Frozen normal source |                       41 |             8 |           2 |    51 |
| Promoted normal      |                       42 |             8 |           2 |    52 |
| Frozen easy source   |                       29 |             8 |           2 |    39 |
| Promoted easy        |                       30 |             8 |           2 |    40 |

The setup section is a physical pool containing Ulchor, the Gate and location
choices. It does not mean all eight cards start in staging. Stage 1A chooses
one different location per player and makes an existing Makeshift
Fortification active; unused copies return to the encounter deck. The final
physical encounter pools are **50 normal / 38 easy**, plus two quest cards.

## Printed text corrections

All new encounter faces were read; five shadows were absent from the
upstream text and are restored only in the promoted definitions:

| Card             | Printed shadow                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Champion of Rhûn | Deal 1 damage to defending character.                                                                                                    |
| Caught Off Guard | Attacking enemy makes an additional attack against you after this one.                                                                   |
| Street Fighting  | Assign X damage among characters you control, where X is 1 more than the number of locations you control.                                |
| Under Siege      | Attacking enemy gets +1 attack. If this attack destroys a character, return the highest-threat location you control to the staging area. |
| Ulchor's Revenge | Attacking enemy gets +1 attack for each location you control.                                                                            |

The other eight new encounter designs have no printed shadows. Ulchor's
printed threat is **1**, not X; his engagement/attack/defense/hit points are
50/6/4/9, with Victory 6. The Gate has **X threat**, five quest points and
Victory 5. Stage 1B has a printed base of **4 quest points**, plus four per
player; stage 2B has **12**. Both stage texts and the Gate's travel restriction
remain independent conditions.

Duplicated upstream Surge, Archery, Doomed, Guarded and Restricted keywords
are reduced to the single printed occurrence. Minor transcription repairs
include Contested Square's “return”, the quest title “Drive Them Out”,
“encounter deck”, Tom Bombadillo!'s “to the victory display”, Durin's Axe's
“attached hero”, and Charge into Battle's “staging area”. Silver Circlet's
Spirit symbol is represented by `[spirit]`. Tom Bombadil has a printed dash
instead of a resource cost, retained in `printed_stats`; no numeric cost is
invented. The Burglar's Turn has separate front and reverse text and images.
Shared encounter definitions reuse the already verified A Shadow in the East
corrections, including Warriors of the East's eight quest points, Victory 10
and Forced enemy-entry ability.

## Rules evidence

MEC78 page 1 says explored locations are taken into the first player's play
area instead of discarded, with all progress removed. They remain in play,
with active text, and can be affected by card effects. Returning a controlled
location to staging removes its progress; eliminating a player returns every
location they control to staging. The insert contains an apparent copied
Gondor narrative sentence in this section, but its operative rules refer to
the printed Wrath and Ruin stages and locations.

MEC78 page 2 prints the original Encounter reserve rule of three cards total
per player. The later publisher rule is different. The official
[Angmar Awakened Hero Expansion booklet](https://images-cdn.fantasyflightgames.com/filer_public/30/2e/302e7c1c-216d-401a-9519-4509d58554e8/mec107_rules.pdf),
**printed page 2**, was downloaded and visually read. Its exact instruction is:

> When setting up a scenario, each player may set aside up to 3 copies of each
> card with the encounter keyword, out of play.

This is a limit of three per design, not three across the combined reserve.
The PDF has **3,755,710 bytes**, SHA-256
`cfe2956cba8ffcd3e9ee50272c53e86c56a3212ec4f71b18c9e54549036cddf7`.
The implementation uses this current publisher wording. Both original and
current rules forbid these cards in the player deck, exclude them from the
50-card minimum, prevent cancellation of their When Revealed effects, put
them in the encounter discard pile when dealt as shadows, and remove them
from the game when they would leave play.

The following are **designer correspondence reproduced by a community
compilation**, not a separately published Fantasy Flight FAQ:

- [3.325](https://alongextendedparty.com/semi-official-errata-faq-1-10/): an
  effect may choose another player's set-aside Encounter card, except Ranger
  Summons, whose text specifically restricts the selection to your own cards.
- 3.331: the Burglar's “collection” means cards normally eligible for a player
  deck; boons, treasures and encounter cards are excluded.
- 3.332: the Burglar's Turn bypasses Guarded entirely, including when its loot
  is claimed after exploration. The chosen character must still be eligible.
- 3.334 and 3.366: a unique loot card already in play cannot enter; it is
  discarded without replacement. Loot on a location explored in staging is
  discarded, rather than claimed through the contract.

The final 9 March 2020 post in the archived
[FFG discussion about travel and immunity](https://ffg-forum-archive.entropicdreams.com/topic/303966-the-burglars-turn-and-travelling-to-locations/)
reports Caleb Grace's answer that traveling to a location immune to player
card effects does **not trigger** the contract. The post reports the result;
it does not reproduce his email verbatim. This agrees with the general
immunity rule and does not spend or discard a loot card.

No explicit publisher or designer ruling was located for the finer distinction
between different titles and different printings in the fourteen-card loot
selection, or for placing The One Ring in that separate deck. The older forum
thread discussing the Ring contains player speculation. It is not used as an
authoritative ruling. Ordinary printed deck restrictions, card eligibility,
immunity and attachment legality still apply; implementation choices beyond
the quoted rulings are documented as rule applications in the contract notes.

## Verification

`tests/wrath-ruin-sources.test.ts` checks the four immutable source hashes,
exactly scoped recipe correction, all independent quantities, the original
60-card pack inventory, all 39 artwork byte pins, the five printed shadows,
and player/contract face metadata. The six source tests pass. Runtime rules,
native-action tests and responsive browser checks are separate evidence and
are recorded in the scenario and player implementation notes.
