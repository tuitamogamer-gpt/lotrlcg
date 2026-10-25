# Original A Shadow in the East sources

Checked 25 October 2026. This import covers the original **MEC77 A Shadow
in the East** deluxe: The River Running (`Q09.1`/`E09.1`), Danger in
Dorwinion (`Q09.2`/`E09.2`) and The Temple of Doom (`Q09.3`/`E09.3`),
all thirteen player designs, and the two physical Stinker cards used by
Sméagol. Later Vengeance of Mordor packs are separate imports.

## Printed sources and inventory

The [original MEC77 insert](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC77.pdf)
is an archived scan of the publisher's printed insert, hosted by Hall of
Beorn. It is not a newly verified publisher-hosted download. The PDF has
6,185,636 bytes and SHA-256
`8d69cc430042b20b0926f566e522b954121bca8d6dd50223ce531c176c13203a`.
Its printed difficulties are 6, 5 and 7 respectively. The catalogue shortens
the final title to “Temple of Doom”; the printed title includes “The”.

The insert lists 156 physical cards: two heroes, 29 other player cards,
115 encounter cards and ten quest cards. The thirteen player designs
comprise two heroes, nine ordinary deck-card designs printed three times,
one copy of The One Ring and one Fellowship contract. Stinker has two
copies and belongs to the Sméagol encounter set. Gollum is the reverse of
the physical Sméagol card, not a fourteenth player design or extra card.

All **95 distinct original faces** were visually read: 79 scenario faces
plus sixteen player/linked faces, including both Sméagol/Gollum and
Fellowship faces and Stinker. The scenario images total 12,110,471 bytes;
the sixteen player/linked images total 2,411,893 bytes. Original image URLs,
local paths and SHA-256 hashes are preserved in the preparation bundles
and `tests/shadow-east-player-art.ts`.

## Immutable preparation

The repository preparation CLI produced the three source bundles before
any runtime corrections. Their status remains `pending-rules` because
they are provenance snapshots, not the automation registry. Runtime
definitions and recipes are promoted into separate files.

| Immutable file | SHA-256 |
| --- | --- |
| `public/catalog.json` | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json` | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json` | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `pending/the-river-running-import.json` | `028d5de920e81b00b64895242f046aab8b1647dc72f2316caef2bb2e89d15b88` |
| `pending/danger-in-dorwinion-import.json` | `025a5ceee066199196b95fca166e10a17edb95b7669193438d49d97f637386db` |
| `pending/temple-of-doom-import.json` | `b44560f2aa8425ba7bfff40c812cd298ecd14414f631c91bd633d6121019a40a` |

| Scenario | Identities | Face entries | Normal physical cards | Easy physical cards |
| --- | ---: | ---: | ---: | ---: |
| The River Running | 20 | 22 | 40 | 30 |
| Danger in Dorwinion | 26 | 29 | 45 | 37 |
| The Temple of Doom | 28 | 33 | 49 | 37 |

The three bundles contain 69 distinct scenario identities and 79 distinct
faces. Their 84 face entries repeat the five shared Easterling Raiders
designs used by both River and Temple. Runtime registration must deduplicate
these identities without removing their physical copies from either recipe.

## Independent normal/easy quantities

Every identity was compared against the original Normal and Easy columns
on the [River](https://hallofbeorn.com/LotR/Scenarios/The-River-Running),
[Dorwinion](https://hallofbeorn.com/LotR/Scenarios/Danger-in-Dorwinion) and
[Temple](https://hallofbeorn.com/LotR/Scenarios/The-Temple-of-Doom) inventory
pages. All 74 per-scenario rows agree with the frozen recipes. No quantity
correction is needed. `tests/shadow-east-source-quantities.json` retains
the independent quantities; Nightmare columns were not imported.

| Recipe | Main encounter deck | Separate encounter zones | Quest cards | Total |
| --- | ---: | ---: | ---: | ---: |
| River normal | 31 | 6 staging + 1 set aside | 2 | 40 |
| River easy | 21 | 6 staging + 1 set aside | 2 | 30 |
| Dorwinion normal | 36 | 3 Plots + 3 Cultists | 3 | 45 |
| Dorwinion easy | 28 | 3 Plots + 3 Cultists | 3 | 37 |
| Temple normal | 37 | 5 Power cards + 2 staging | 5 | 49 |
| Temple easy | 25 | 5 Power cards + 2 staging | 5 | 37 |

These are source recipe zones before player-count-dependent setup. River's
six staging entries include four suggested Easterling copies, alongside
Pursuit and River Running. The printed setup permits choosing from **all
five** eligible Easterling enemy designs in the physical pool. Only one
different enemy per player enters staging, and unselected copies remain
available in the encounter deck. The recipe does not grant four extra
enemies in a one-player game. Encounter totals excluding main
quests are 38/28, 42/34 and 44/32 respectively.

## Printed runtime corrections

Only promoted definitions change; the source catalogue and preparation
bundles remain untouched.

- All six encounter side quests lacked numeric quest goals upstream:
  Warriors of the East **8**, An Arduous Journey **6**, Shadow of Fear **6**,
  Unwelcome Travelers **5**, Tribute to Mordor **12**, Lost in the Dark **8**.
  Each has printed **Victory 10**.
- Warriors of the East's enemy-entry ability is **Forced**, not “When
  Revealed”. Its own Surge and current-quest attack remain separate effects.
- Easterling Raider's shadow gives **+1 attack**, or **+2 attack** when the
  enemy has an Easterling attachment. The second symbol is not defense.
- Painful Fatigue's shadow returns the attacking enemy to staging **after
  this attack**, not immediately during shadow resolution.
- Twisted Tunnel's shadow discards the top encounter card and adds it to
  staging if it is an enemy. The upstream text incorrectly placed Fearful
  Shadows' shadow here instead. Fearful Shadows has its own printed shadow:
  the defending character cannot ready until the end of the round.
- The Forgotten Temple **1B** says **“Skip the quest phase.”**, omitted
  upstream. It has no printed progress target and Victory 10. The four
  other quest cards are all **2A/2B**, with Victory 1 and printed goals
  **8, 12, 16, 0** for Legacy, Memory, Shrine and Lord respectively. Their
  arbitrary upstream ordinal costs 3/4/5 are corrected to stage number 2.
- The Tower of Barad-dûr has a printed dash for quest points, not a numeric
  goal. Thane Ulchor and Hall of Horrors have printed **X threat**. Ulchor
  has 50 engagement, 6 attack, 4 defense, 9 hit points and Victory 6.
- Black Númenórean's name and “Forced” prefix are restored. Minor
  transcription typos in other titles' rules text are repaired without
  changing rules: Seedy Tavern, Catacombs, engagement, “at least”,
  Thane Ulchor and “placed”.
- One Ring has no printed resource cost; the upstream numeric zero is
  omitted. Derufin has one Ranged keyword, not two. Put Off Pursuit uses
  **“When attached location is explored”**, not “After”.
- Sméagol and Fellowship have separate front text and reverse metadata.
  Sméagol's original reverse is the unique **Gollum** enemy: engagement
  50, threat/attack/defense 2 and hit points 3. Runtime alias `21072.B`
  retains Sméagol's original UUID and physical identity. It does not
  represent an extra encounter-deck copy.
- Stinker's printed shadow is separated from its reveal text. It raises
  the defending player's threat by 2, or 4 if Gollum is engaged with that
  player, then shuffles the physical Stinker card into the encounter deck.

## Insert rules and designer clarifications

The printed insert, pages 2–3, establishes these setup rules:

- Each player may choose one contract. It enters alongside the heroes with
  its A side faceup. Contracts are never included in the deck or minimum
  deck size. Contract deck restrictions must be satisfied.
- The One Ring attaches immediately after placing starting heroes. If
  multiple decks contain it, the first player selects which player's copy
  enters play and all other copies are removed from the game. Only its
  controller may use Master cards; Master cards cannot be used in Saga
  expansions.
- Sméagol cannot be a starting hero in Saga expansions or the Shadows of
  Mirkwood cycle. His setup adds two physical Stinkers to the encounter
  deck. Flipping to Gollum means Sméagol leaves play and Gollum enters
  ready, initially engaged with his owner; Gollum then engages the first
  player. On defeat, Gollum leaves play and Sméagol enters under his
  owner's control, exhausted.

The insert's Temple section builds the Power of Mordor deck by shuffling
all five cards from that encounter set. “Quest stages in the victory
display” counts individual double-sided main quest cards and **excludes
side quests**. Memory's printed effect adds staging threat; it has no
additional duration sentence in the original scan.

The [compiled designer correspondence](https://alongextendedparty.com/semi-official-errata-faq-1-10/)
reproduces direct Caleb Grace answers. This community-hosted compilation
is distinguished from publisher-issued rules and from optional community
setup revisions:

| Item | Designer clarification used |
| --- | --- |
| 3.264, 8 August 2018 | Mulligan affects the six initial drawn cards; extra cards added by Setup are retained. |
| 3.330, 14 November 2019 | “Cannot be canceled” is absolute; The Master Ring cannot bypass Sacked!'s prohibition. |
| 3.333, 25 November 2019 | If Sméagol is the last hero and flips to Gollum, his owner is not eliminated. Undefended attack damage has no hero recipient. |
| 3.349, 3 March 2020 | Effects may shuffle the physical double-sided Sméagol card into the player's deck. |
| 3.354, 18–19 April 2020 | Follow the printed insert's setup timing; One Ring searches for a Master card before drawing the opening hand. This reverses the conflicting March 2020 answer. |
| 3.395, 18 December 2025 | Caleb's stated intent permits The Master Ring to cancel the entire revealed encounter side-quest card, replacing it with another reveal. This differs from canceling only its When Revealed effect. |

The searched Master card therefore survives a mulligan. Optional community
reworked setup rules are not adopted by this source promotion.

The original Core rulebook, page 25, says: “If control of that character
changes, so does the control of any attachments on that character.” This
includes The One Ring when its bearer temporarily changes controller.
The complete paragraph is preserved in the
[Core rulebook transcription](https://www.rulespal.com/lord-of-the-rings-the-card-game/rulebook#control-and-ownership);
publisher PDF downloads returned HTTP 503 during this audit. Ownership
remains separate from control.

FAQ 1.53 distinguishes canceling a When Revealed effect from FAQ 1.54's
whole-card cancellation, which treats the card as never revealed. The
Master Ring uses whole-card cancellation. Applying that distinction, it
does not trigger Exposed Riverbank's response to a canceled When Revealed
effect; no Riverbank-specific designer answer was found. The compiled
designer answer 3.192 confirms the general distinction using Thaurdir and
Wingfoot as examples.

## Reproducible evidence

Original PDFs, text extraction, contact sheets, source inventories,
designer quotations and a field-by-field correction record are cached in
the ignored `output/shadow-east-release/sources/` directory. Tracked tests
pin immutable inputs, all six physical recipes against independent
quantities, every scenario image, all sixteen player/linked images, and
the substantive printed corrections:

```sh
node --import tsx --test tests/shadow-east-sources.test.ts
```

These source checks establish provenance and printed facts. They do not
replace the separate engine, complete-game and browser tests for gameplay.
