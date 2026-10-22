# Original Ered Mithrin finale sources

Checked 22 October 2026. This batch covers the original MEC70 **Mount
Gundabad** (`Q08.8`/`E08.8`) and MEC71 **The Fate of Wilderland**
(`Q08.9`/`E08.9`), standard/easy for one to four players. Campaign
additions and Nightmare content are outside this promotion. Established
publisher errata remain applicable to the original player identities.

## Printed sources and evidence classes

The original publisher inserts were read from Hall of Beorn's archived
scans. These are scans of the original printed inserts, hosted by the
community; they are not newly verified publisher-hosted downloads.
The original Mount Gundabad insert contains two designer-confirmed errors,
listed below. MEC71 adds no special scenario procedure beyond its encounter
sets; most of its rules are on the cards.

| Original insert                                                                     | Printed difficulty |     Bytes | SHA-256                                                            |
| ----------------------------------------------------------------------------------- | -----------------: | --------: | ------------------------------------------------------------------ |
| [MEC70](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC70.pdf) |                  8 | 1,781,310 | `493ce6faa124399fca83baf5a2c65decb3d1e9849e7d85f3efdbb7a6496c2c86` |
| [MEC71](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC71.pdf) |                  6 | 2,724,778 | `26a58e5ee9e02bbd4599b1aee0859ba6ad637f3bacb4f24331a88e035cc29f23` |

Copies, extracted text, inventory pages, designer excerpts and contact sheets
are cached under the ignored `output/ered-finale-release/sources/` directory.
`rules-pins.json` and `scenario-art-audit.json` record source URLs, exact
bytes and hashes. The latter independently verifies every artwork entry in
the two immutable pending bundles against its local original image.

The [original Wilds of Rhovanion insert, page 2](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec65_web_the-wilds-of_rhovanion_rules.pdf)
is publisher-hosted primary evidence for Guarded (X): it triggers when a
card **enters play**, irrespective of whether it was played, and an empty
encounter deck is refilled while resolving the keyword. Its previously
pinned source is recorded in [Wilds sources](WILDS-RHOVANION-SOURCES.md).

The [compiled designer correspondence and FAQ](https://alongextendedparty.com/semi-official-errata-faq-1-10/)
reproduces Caleb Grace's direct answers. Those answers are distinguished
here from both original printed rules and optional community balance
changes. The compilation itself is not a publisher-issued FAQ.
`designer-rulings-verbatim.json` preserves complete questions and answers;
`designer-clarifications.json` also preserves reprint-section extracts.
The [official Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf)
and [original Core rules, page 22](https://images-cdn.fantasyflightgames.com/ffg_content/lotr-lcg/LOTR%20Rules.pdf)
supply general lasting-effect, elimination and timing rules.

## Frozen scope and identities

Both source bundles were prepared with the repository import CLI, retaining
the catalog, reference recipes, original OCTGN identities and original face
URLs. Neither catalog nor preparation snapshots are corrected in place.

| Immutable input                              | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                        | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                      | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`        | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `pending/mount-gundabad-import.json`         | `cde68d15cf93fae5f15a3d34a78aab39eda858b7c496e5755a726e7ce89b4557` |
| `pending/the-fate-of-wilderland-import.json` | `1bf380dd3b9db0ab4e68cc9306dd62991c3333f23cfeddf14996e5537d513b19` |

Mount Gundabad has **36 physical scenario identities and 45 faces**:
21 new identities/30 faces and 15 reused Wilds of Rhovanion identities.
Wilderland has **23 identities and 26 faces**: 16 new identities/19 faces
and seven reused Wilds identities. All **71 scenario faces** were visually
read, including the original shadows and both sides of every quest and
Wormsbane. There are no rulesheet proxies in these two preparation bundles.

All **20 original player scans** were independently visually read as well.
Their UUID source URLs, local paths, bytes and hashes are pinned in
`tests/ered-final-player-art.ts`; the 20 images total **3,007,337 bytes**.
Armor of Erebor (`19120`) already has a complete registered definition
and passive implementation, so the two packs add **19** player definitions
while retaining all 20 source records. Tactics Bilbo and hero Radagast are
different designs from the existing Lore Bilbo and ally Radagast.

Each original retail pack contains 60 cards: Mount Gundabad has 28 player
cards, 24 encounter cards and eight quest cards; Wilderland has 28 player
cards, 29 encounter cards and three quest cards. These physical retail
counts are distinct from scenario inventories that reuse deluxe cards.

## Independent original quantities

The [Mount Gundabad](https://hallofbeorn.com/LotR/Scenarios/Mount-Gundabad)
and [Wilderland](https://hallofbeorn.com/LotR/Scenarios/The-Fate-of-Wilderland)
original Normal/Easy columns were checked independently against every
recipe entry. Nightmare columns are excluded.

| Recipe                   | Main encounter deck | Caves | Forge set aside | Initial staging | Quests | Total |
| ------------------------ | ------------------: | ----: | --------------: | --------------: | -----: | ----: |
| Gundabad standard        |                  41 |     8 |               1 |               2 |      8 |    60 |
| Gundabad easy, corrected |                  30 |     8 |               1 |               2 |      8 |    49 |
| Wilderland standard      |                  43 |     — |               — |               3 |      3 |    49 |
| Wilderland easy          |                  30 |     — |               — |               3 |      3 |    36 |

The frozen Gundabad easy recipe omits **both Wilderland's Bane** copies.
The native card's encounter index and Hall of Beorn retain two in both
modes; runtime restores them. Suffocating Shadows already has its correct
two copies in both frozen recipes. All other original quantities agree.
Both frozen Gundabad recipes already place Dagnir's Hoard and Throat of the
Mountain in the eight-card Caves deck. Wilderland's two recipes require no
quantity correction. Setup subsequently moves actual discarded location
or enemy copies from these inventories into staging; it does not create
additional cards.

## Runtime transcription corrections

Corrections belong only in promoted runtime definitions.

- Gundabad's native stage name is **Frenzied Warrens**, not the catalog's
  “Frenzied Warriors.” All eight quest identities have **Victory 1**,
  including The Side Door and The Great Worm. The First Forge, Dagnir's
  Hoard and Throat of the Mountain also each have **Victory 1**.
- Wormsbane is an **objective on both sides**, rather than an attachment
  card type. Its title remains **Wormsbane** on both faces. Its traits are
  **Artifact. Weapon. Broken.** and **Artifact. Weapon. Reforged.**;
  Reforged is a trait, not a different title, and neither side has Item.
  Attaching an objective does not change its printed type.
- Gundabad Dagnir has **X threat**, 20 hit points, 50 engagement,
  7 attack and 5 defense. X is one more than the number of quest cards
  in the victory display. This is a different identity from Fire's Dagnir.
- Wilderland Urdug has **Victory 5**, Gate of Gundabad **Victory 1**, and
  Dwarven Watchtower **Victory 2**, all omitted from the catalog.
  The objective traits are **Assault.** and **Defense.** respectively.
  Urdug's Elite has the ordinary “place” transcription typo repaired.
- Wilderland's three main quests have printed **no progress target**.
  Runtime uses explicit zero goals and scenario-specific advancement;
  zero must not cause generic automatic advancement.
- Gate, Hilltop Battlements and Dwarven Watchtower have **no shadow
  effect** on the original faces. They must not acquire invented shadows.
  Urdug's original statistics are 50 engagement, 2 threat, 3 attack,
  2 defense and 5 hit points, distinct from Roam's physical Urdug.
- Shared source labels preserve “Stone Troll”/“Swarms of Bats” upstream,
  while canonical runtime names retain the verified printed **Stone-troll**
  and **Swarm of Bats**.

## Mount Gundabad timing and physical zones

The original insert shuffles seven stage-2 cards into a quest deck, 2A
faceup, beneath stage 1. Stage 2 is a branching deck, not a numeric march
toward a nonexistent stage 3. The Side Door ends planning by letting the
first player inspect two actual top cards, bottom one, put The Side Door
in the victory display, and reveal the next 2A.

Designer clarification **3.306** confirms that the printed cards are
correct: a current 2A flips at the **beginning of the quest phase**, before
commitment, despite the initial insert saying staging. The 2A's When
Revealed returns the same Dagnir to staging. Defeating a stage puts that
physical quest in victory; bypassing clears its progress and bottoms it
with 2B facedown, then reveals the next 2A. Foreboding Darkness and Throat
of the Mountain explicitly flip the selected next quest immediately.
If The Lower Deeps makes a new location active while one remains active,
the old location is retained under official FAQ **1.34**; its printed
effect contains no discard or return instruction for the old location.
Clarification **3.386** allows progress on 2A but discards that progress
when it becomes the differently named B side.

Clarification **3.315** adds **Dagnir's Hoard and Throat of the Mountain**
to the six Lost Caves locations. Deep replaces a traveled-to location
with the actual top Cave and is ignored when the Caves deck is empty.
It is not another travel action. The printed Forked Passage response
resolves before Deep and can send Forked Passage to victory; that does
not cancel its pending Deep replacement. Becoming-active effects apply
to the replacement. The First Forge begins set aside and is added only
by the printed Upper Levels defeat effect.

Clarification **3.348** says “after characters are committed” means
**after all players finish committing**, not once per committing seat.
Clarification **3.307** gives the first player the order of simultaneous
Dagnir's Wrath attacks; the card does not say “in turn order.”
The same simultaneous-attack principle applies to Wilderland's Bane;
that extension is a timing inference, not a separate Bane-specific ruling.
Dagnir's Hoard explicitly does use turn order. Each is a real attack
with shadows unless a printed effect expressly changes the procedure.
Clarification **3.346** directly addresses enemies considered engaged
with each player: they attack each player during that player's normal
enemy-attack step and receive **a fresh shadow card for each attack**.
One shared physical enemy does not reuse its first player's shadow card.

All quest cards in victory count toward Dagnir's X and the printed
thresholds, including player and encounter side quests. Dagnir is
Indestructible; lethal damage alone never removes her. Her normal damage
cap is per round. Dagnir's Wrath explicitly bypasses that cap and does
not consume it. Dagnir's Slave blocks non-quest damage separately.
Clarification **3.263** applies to assigned damage outside Archery too:
an allocation cannot assign a character more than its available hit
points, including when that character can later prevent the damage.
At five quests in victory Dagnir cannot leave staging and is considered
engaged with every player. This restriction does not itself relocate an
already engaged Dagnir; her printed 2A revelation returns her to staging.
The Great Worm's victory response requires
a resolved player attack, no remaining Dagnir hit points, and that
attacker's controlled Reforged Wormsbane. It does **not** itself require
five quests in victory. With four or fewer, the stage must be bypassed
at the end of combat if the players have not already won.
With five or more, The Great Worm provides no optional bypass.

## Wilderland timing and counters

The Goblins' Assault progress and The Heroes' Defense resources are
separate physical objective counters. Advancing stages retains both.
Urdug remains physically in staging; the Defense threshold only adds
considered engagement. The Gate blocks new Defense resources while
it is in staging. Its travel cost can retrieve a physical Goblin Troop
from deck, discard **or victory**.

Urdug cannot receive damage until he has **resolved an attack in the
current phase**, including an immediate attack. The permission expires
at the phase boundary. His defense bonus counts every other enemy in
play. Destroying him wins on **any** stage.

Stage-1 progress accumulates at round end from enemies in staging;
stage 2 adds progress after every enemy attack, in any phase;
stage 3 adds progress at round end for enemies anywhere in play.
Threshold checks occur at the timing printed on each stage, rather
than immediately whenever the counter changes. Stage-2/3 revelations
shuffle the encounter discard and add actual discarded enemy copies;
they do not reveal those enemies.
Clarification **3.321** explicitly cites the Fate quests: advancing by
their printed effects does not defeat those stages and does not trigger
responses that require a quest defeat. Blank quest points alone do not
forbid progress placement; Gundabad clarification **3.386** permits it
on the blank-valued 2A face.

Warg-rider and the shared Pack of Wargs check a **dealt shadow with
no effect**; canceling an effectful shadow does not make it a blank
card. Additional attacks, discarded shadows and attack completion
must retain the physical attacking enemy and attacked player.
Dark Clouds is an encounter lasting effect: its threat modifier
also affects enemies/locations that enter staging later in that phase.
This follows official FAQ **1.55**, which recalculates encounter-created
lasting effects when the game state changes. Dark Clouds' shadow checks
the attachment's controller, using official FAQ **1.38** for player
attachments on another player's character; its physical owner still
determines the discard destination. Encounter Conditions do not become
player-controlled merely by attaching to a character (**1.06**).

The Core elimination rule explicitly says that an eliminated seat
leaves “one less player ... in the game.” Printed current-player
thresholds and choices therefore use the surviving player count;
they are not automatically fixed to the original table size.
The staging reveal count locks at the beginning of staging under
FAQ 2.24, which is a separate timing rule.

## Player errata and sensitive shared hooks

Original Radagast and Reforged scans differ from current RingsDB text.
These are intentional designer-confirmed reprint errata, not reasons to
restore the older behavior. Clarification **3.384** records Caleb's
confirmation that both cards were deliberately changed to work as
originally intended. Radagast gains the three other printed sphere icons
while playing a Creature ally, including a Staff-discounted zero-cost
ally. Reforged targets an **Item** attachment and retains its explicit
permission to use another sphere.

Hall of Beorn's URLs under an “Ered-Mithrin-Hero-Expansion” image folder
were also checked. They currently serve the original 2018 #145/#153
images, so those downloaded images are **not primary reprint proof**.
The errata decision instead cites the current canonical rules and
designer confirmation. Their cache manifest records this limitation.

The original Mithril Shirt has Guarded (location) **once**, rather than
the duplicated catalog text. Messenger Raven says “or have attachments.”
The publisher's Guarded (X) rules apply to The King's Return and
Reforged just as to an ordinary play: putting a card into play cannot
skip its guard. Typed guarded cards retain their physical identity and
owner through milling, guarding and release.
Clarification **3.286** addresses a deck with no viable guard: after
exhausting the possible encounter pool, Sting is immediately claimed.
There is no instruction to discard the guarded attachment in that case.

Caleb's **3.298** explicitly permits Round Shield after a shadow effect
was triggered and then canceled by Hasty Stroke. An actually blank
shadow supplies no such trigger. The bonus lasts for that attack.
FAQ **1.55** calculates a player-created lasting effect when initiated;
Bilbo's willpower bonus captures the chosen enemy's threat then.
The Rules Reference keeps a lasting effect after its source leaves
play. Clarification **3.289** permits repeated Bilbo responses after
legal removal/recommitment and applies the delayed damage for each.

Erebor Toymaker's response requires playing it from hand, but discounts
the next attachment played **by any player** that phase. Radagast's Staff
instead explicitly discounts the next Creature ally **you** play.
The Great Hunt requires actual spending from three different hero pools;
normal cost/sphere eligibility alone is insufficient. Gaffer Gamgee's
restriction is player-specific and lasts the round, rather than globally
preventing that enemy's attacks against everyone.
