# Original A Storm on Cobas Haven sources

Prepared and checked on 13 October 2026. This import covers the original MEC52
Adventure Pack, eleven player designs (`12109`–`12119`), and the original
standard/easy scenarios (`Q06.8`/`E06.8`). Revised Dream-chaser campaign and
Nightmare versions remain separate.

## Printed rules and source integrity

- [Original MEC52 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec52_rules.pdf),
  linked by the publisher's game page and retrieved with HTTP 200: 728,608 bytes,
  SHA-256 `ecab681920e85d0d0bd9a0dd165666ee9456f8c6f533282c9b79faee0cd1db1c`.
  Both pages were rendered and visually checked. Difficulty is **7**. The insert
  supplies the story and six encounter-set requirements; it adds no new rules.
- [Original Grey Havens rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf),
  SHA-256 `672ec9860bc2693a7bd81c5b9452de403f2e986bea74769ad3ca238db2df3bb2`.
  Pages 4–6 define ships, fleet preparation, the separate Corsair deck, Boarding,
  Heading and Sailing. These shared rules also appear on the two scenario
  rulesheet-proxy faces in the source snapshot. The proxy is a community
  reference representation, not an additional printed game card.
- [Official Easy Mode rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_easy_mode.pdf),
  SHA-256 `52fd5fde07ee01398f46399fa6afd6dd77f2b0987150756b4d0944fe288d1a9f`,
  require removing gold-bordered encounter copies and giving each hero one
  additional setup resource.
- [Hall of Beorn original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/A-Storm-on-Cobas-Haven)
  independently supplies normal/easy per-design quantities. Its normal/easy
  encounter totals are 62/48, before the three quest cards. This source is
  needed for designs whose physical copies have different border colors:
  a single cached scan of a design cannot establish every copy's easy status.
- [Publisher preview, The Corsairs of Umbar](https://www.fantasyflightgames.com/en/news/2016/9/20/the-corsairs-of-umbar/)
  independently confirms the Raider Flagship's printed timing at the **end**
  of the encounter phase.
- [RingsDB original SoCH set](https://ringsdb.com/set/SoCH) preserves original
  player positions 109–119, one hero and ten three-copy designs.

The pinned DragnCards references described in [CONTENT-IMPORT.md](CONTENT-IMPORT.md)
and the new preparation snapshot retain their original bytes:

| Reference                                             | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                                 | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                               | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/pending/a-storm-on-cobas-haven-import.json` | `44ef0bff2f11c0e06d3f6996b37ded2a51398da51dcb42de61f0361df8f97af8` |

The immutable snapshot contains **38 identities and 43 face records**. Nineteen
identities are from SoCH: fifteen encounter designs, three quests and one
rulesheet proxy. Nineteen identities are reused Grey Havens designs, including
the Heading reference. The new pack contributes 23 original face files; the
remaining 20 faces already belong to Grey Havens. All 43 files were decoded and
visually checked, including both Heading faces and both rulesheet-proxy faces.
Their URL, local path, byte count and SHA-256 remain in the snapshot.

The preparation snapshot's `pending-rules` status describes the preserved input,
not runtime support. Its `expansionRules` link points to the shared Grey Havens
rules. The dedicated MEC52 insert is linked separately above. Runtime data and
corrections are promoted into separate `cobas-*.json` files.

## Original physical inventory and recipe corrections

The original pack contains **60 physical game cards**: 31 player cards,
26 encounter cards and three quests. The Heading reference and four player-fleet
ships come from Grey Havens; selecting fleets does not create extra copies.

The upstream source's easy recipe is incomplete: it removes the correct shared
Grey Havens cards but retains all SoCH copies. The runtime easy recipe additionally
removes **one Siege Ship, one Heavy Cruiser, two Coast of Anfalas and one Taking
on Water**. These five corrections follow the original easy inventory; the
unchanged source recipe remains reproducible for comparison. Both runtime modes
exclude the single rulesheet proxy. No other quantity or storage section changes.

| Zone before printed setup                                           | Standard | Easy |
| ------------------------------------------------------------------- | -------: | ---: |
| Main encounter deck                                                 |       33 |   23 |
| Corsair deck (`sharedEncounterDeck2`)                               |       16 |   12 |
| Set aside: two Dol Amroth Warships, four fleet ships, Heading       |        7 |    7 |
| Source staging: Flagship, Scouting Ship, four Dol Amroth objectives |        6 |    6 |
| Quest deck                                                          |        3 |    3 |
| Physical gameplay cards/references                                  |       65 |   51 |

These are storage-zone counts, not a fully resolved initial board. Printed setup
keeps the Flagship and one Scouting Ship in staging, chooses exactly one of the
four Dol Amroth objectives, shuffles the other three into the encounter deck,
and resolves Guarded on the chosen objective. The encounter deck therefore
contains 36/26 cards immediately before the chosen objective's Guarded reveal.
Players prepare their fleet according to the original shared rules; the two
Dol Amroth Warships remain aside for The Beacon.

| Main encounter design | Standard | Easy |
| --------------------- | -------: | ---: |
| Corsair Skirmisher    |        2 |    2 |
| Siege Ship            |        3 |    2 |
| Heavy Cruiser         |        1 |    0 |
| Coast of Anfalas      |        3 |    1 |
| Belfalas Islet        |        2 |    2 |
| Cobas Haven           |        2 |    2 |
| Ramming Speed!        |        2 |    2 |
| Taking on Water       |        2 |    1 |
| The Raiders' Assault  |        2 |    2 |
| Scouting Ship         |        2 |    2 |
| Starlit Sea           |        2 |    2 |
| Fog Bank              |        2 |    2 |
| Light Cruiser         |        2 |    2 |
| Corsair Warship       |        2 |    0 |
| Battle-Hardened       |        2 |    0 |
| Boarding Party        |        2 |    1 |

The Corsair deck contains Southron Sailor ×2, Cunning Pirate ×3, Vicious Marauder
×2, Umbar Raider ×3 and Corsair Infiltrator ×2 in both modes. Standard mode also
includes Umbar Captain ×2 and Raid Leader ×2; easy mode removes those four cards.
It has its own discard pile and replenishment rule. Non-ship enemies do not enter
the main encounter discard pile.

## Printed corrections and Sailing symbols

The original faces establish three additional source transcription corrections:

- **Raider Flagship** resolves its Corsair reveal at the **end** of the encounter
  phase. The catalog incorrectly says beginning. It is unique, has printed
  engagement 50, 3 threat, 5 attack, 3 defense, 18 hit points and Victory 20.
- **Belfalas Islet** has **Victory 1**, omitted from the catalog. Its printed
  stats are 1 threat and 5 quest points.
- **Cobas Haven** has **no shadow effect**. The catalog incorrectly includes an
  off-course attack modifier that belongs to Coast of Anfalas.

The shared Starlit Sea catalog text incorrectly names Uncharted Ocean in its own
travel clause. Its original scan names Starlit Sea; the existing Grey Havens
runtime correction remains authoritative for that reused identity.

`src/data/cobas-sailing-icons.json` records the original front image and SHA-256
for all fifteen new encounter designs. Eight designs each print one Sailing
success helm: **Heavy Cruiser, Coast of Anfalas, Ramming Speed!, The Raiders'
Assault, Sea-ward Tower, Tower of the Gull, The Beacon, and Tower of the Heron**.
The other seven new encounter designs print zero. These visual fields are absent
from source text and are never inferred from names or traits. Reused Starlit Sea
adds its already verified one-symbol design from the Grey Havens metadata.

The three quests print base quest points 10, 16 and 5. Stage 3 adds five quest
points per Ship enemy in play. Its alternative Flagship-in-victory win clause is
on stage 3B; defeating the Flagship at an earlier stage does not itself win.
Stage 2 blocks advancement while any objective is guarded, even after reaching
its printed progress target.

## Guarded timing and shared guards

The [official Rules Reference, page 9](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf)
requires resolving the original objective's replacement guard before the
second objective's Guarded keyword when one objective reveals another.

Two Caleb Grace answers in the
[ALeP designer-rulings compilation](https://alongextendedparty.com/semi-official-errata-faq-1-10/)
resolve the resulting Cobas interactions:

- **Section 3.223, 18 October 2016:** Sea-ward Tower reveals Tower of the Heron,
  then The Raiders' Assault. The pending Heron is not a legal Assault target:
  “it is not considered ‘unguarded’”. An objective awaiting its Guarded reveal
  therefore cannot receive an Assault guard. Keep the printed reveal order;
  do not skip its pending keyword.
- **Section 3.257, 27 April 2018:** Heavy Cruiser revealed as an objective's guard
  still resolves its search, resulting in “Heavy Cruiser guarding two objectives
  at once”. The original guard relationship remains alongside the fetched
  objective's relationship. Defeating that one physical Cruiser frees both.

The compilation attributes both answers to Caleb Grace and lists their source
as the COTR Discord archive. These are transcribed designer rulings, separate
from the site's optional community errata. Heavy Cruiser does not transfer its
guard away from the original objective, and no replacement guard is drawn for
that objective.

## Original player images

The eleven player records preserve the complete original catalog provenance.
The cached original JPEGs are `/cards/12109.jpg` through `/cards/12119.jpg`; each
was decoded and its byte hash pinned below. They were downloaded from `https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/<octgnid>.jpg`, using each original catalog OCTGN identity. Runtime image aliases map relative/full RingsDB references and those original DragnCards URLs to these files.

| Code  | Original design       | Type       | Copies | SHA-256                                                            |
| ----- | --------------------- | ---------- | -----: | ------------------------------------------------------------------ |
| 12109 | Na'asiyah             | Hero       |      1 | `d402715b8dca2d00bfa67435babeacf2805cd56aa077c88c6c893335f5d94ba7` |
| 12110 | Rune-master           | Attachment |      3 | `81e0f1fb49ca3754132b578eff042e1ec59d699c15fb66955bd51b2967a0fd24` |
| 12111 | Terrible to Behold    | Event      |      3 | `e01451591d168fc01e89b91881a2712c2ef2fb3f2324178b0932b98e18107efd` |
| 12112 | Veteran Sword-elf     | Ally       |      3 | `415cf9c115846918fdba7d9a37544f9f92e9a10a0534d3521dffca1fc0a488e2` |
| 12113 | Vigilant Guard        | Attachment |      3 | `cb4d4e338c8a344a4b8bd261f5efc48877e87b021bc56955038856c98634703c` |
| 12114 | Knife-work            | Event      |      3 | `3d665f1db6f10c073545fbc5dae53bdde61bac2e27ec9acf982495741e11ae1c` |
| 12115 | Linhir Sea-captain    | Ally       |      3 | `bc1cb71605c961d26c75bf256c03d73b9ed4d797dbd130608448a3a0114d16c6` |
| 12116 | Windfola              | Attachment |      3 | `05258440a235216c69ed0bf32a8e084ed5c44662cdee439d6e3939aaee326906` |
| 12117 | Ioreth                | Ally       |      3 | `60a6e51edeadd8a2f102b7506dc2d110358332542392673855b498486499d71d` |
| 12118 | The Houses of Healing | Event      |      3 | `94826cf711c6ba419c64ae3cd3246a709f8aa4f6cf7a3022f55d6a4c7493b937` |
| 12119 | Justice Shall Be Done | Event      |      3 | `282d955630f07af288e33ffdd2f46b94aecedbfc128c0f38b6c1e519c3b16d25` |

## Interpretation checks for the player cards

The [official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
section 1.08 limits a physical response to one resolution for one triggering
condition. Vigilant Guard therefore redirects **one point per character's
individual damage assignment**, not each point of a multi-point assignment.
The same attachment may respond again to a later assignment, including another
character damaged by the same encounter effect. No printed per-round or
per-phase cap applies.

Designer answers transcribed in the
[ALeP compilation](https://alongextendedparty.com/semi-official-errata-faq-1-10/)
sections 3.287, 3.316 and 3.318 clarify that redirected Vigilant Guard damage has
the attachment as its source, can receive damage cancellation, and may trigger
separately for multiple characters damaged by one mass-damage effect. These are
reported Caleb Grace rulings, distinct from the compilation's optional community
errata. The repeated-use answer is also preserved in the
[FFG forum archive, 11 June 2019](https://ffg-forum-archive.entropicdreams.com/topic/277776-unofficial-official-rulings-thread/page/2/).
The suggested future once-per-phase cap was never printed; it is not applied.

With multiple Guards, a response to newly redirected attachment damage is a
different assignment from a response to the original character's remainder.
The engine records each physical Guard/recipient pair within that chain, so
using one Guard on a redirected point does not consume its response to the
original recipient. Repeated redirection cycles stop on a visited pair. This
cycle treatment follows the analogous Song of Mocking designer answer in
section 3.304; no direct published multi-Guard ruling was found.

Windfola commits its character by effect and exhausts only the attachment.
An already exhausted character can therefore return to the quest, and effects
that prohibit exhausting the character do not independently prevent that
response. Restrictions against committing to the quest itself still apply.

Terrible to Behold is triggered by the player who declared the Noble defender,
including that character's controller when it uses Sentinel for another player.
The enemy must actually return to staging before the subsequent attack
cancellation resolves. The official Rules Reference's “Then” rule supplies that
requirement; FAQ section 1.32 confirms that changing state alone does not cancel
an attack. An enemy already attacking from staging cannot be returned there.

The Houses of Healing's Healer exhaustion is optional and part of its cost.
The initiating player chooses their own ready Healers, then pays the resulting
resource cost; sufficient resources for the undiscounted value are unnecessary.
A zero resource cost still needs the usual sphere match (FAQ 1.9, Vilya question).
Cancellation does not refund resource or exhaustion costs. Justice Shall Be
Done's self-placement in the victory display is likewise a cost, because it
precedes “to.” Canceling the event leaves that cost paid but creates neither
its economy effects nor its delayed elimination.

The original Warship's destruction effect only sets it aside. There is no generic
Ship-objective controller-elimination rule in Grey Havens page 4: the original
fleet ships have their own individual loss/elimination clauses. Consequently
neither Dol Amroth Warship nor a captured Corsair Skirmisher inherits such a
clause merely from being a Ship-objective.

## Reproduction and verification scope

Run `npm run prepare:scenario-import -- --recipe Q06.8 --download` to reproduce
the unchanged preparation snapshot and source-art map. Run
`node --import tsx --test tests/cobas-import.test.ts` for reference hashes,
physical quantities, documented promotion differences, source face bytes,
Sailing metadata and all eleven player original images.

This document records source verification and import integrity. Full runtime
semantics, save/reload, multiplayer play and responsive browser evidence are
recorded separately with the scenario and player implementation.
