# The Mûmakil

Original Adventure Pack, difficulty 4. Standard and easy mode use the printed **The Mûmakil** and **Jungle Forest** encounter sets. Runtime supports one through four players in local hot-seat play.

Sources, scan hashes, publisher rules, and recipe quantities are pinned in [MUMAKIL-SOURCES.md](MUMAKIL-SOURCES.md). The immutable import snapshot is `src/data/pending/the-mumakil-import.json`. Runtime adds fifteen encounter definitions and two double-sided quests, reusing four existing Jungle Forest definitions.

## The hunt and capture

Setup returns the reference recipe's four reserved location copies to the encounter deck. Starting with the first player, each player chooses a different location. Four physical Wild Mûmak and four physical Capture objectives remain set aside. Exploring an active location during stage 1 shuffles one set-aside Wild Mûmak into the deck. Mûmak Trail offers its printed optional encounter-deck/discard search and charges every player one threat for actual travel.

Stage 1 requires twelve progress and **exactly** as many Wild Mûmak in play as there are participating players. Stage 2 deals one random remaining Capture objective per player, in player order, with a saved choice of Wild Mûmak target. The printed instruction permits multiple Capture objectives on one enemy; it does not require different targets. Capturing adds only the triggering objective and its attached enemy to the victory display. Other attachments leave normally. Stage 2 requires eight progress and no Capture objective remaining in play.

All four capture methods use their printed response windows and the currently engaged player: Horse-hair Lasso after actual damage, Poisoned Spear after quest success before progress is placed, Pit Trap after actual travel using printed location threat, and Noose of Vines after a surviving character defends. Lasso shuffles and discards the engaged player's actual deck; Spear discards an actual encounter card. Responses may be declined and pending decisions survive reload.

Wild Mûmak are immune to player-card effects and indestructible. Their three-damage cap counts actual damage separately for each physical enemy and round, including across save/reload. At round end, each engaged Wild Mûmak offers the printed return-to-staging or immediate-attack choice.

## Jungle encounter rules

Territorial Ape scales with the active location's current threat; Guardians of the Jungle raises every location's threat and searches for an Ape when selected as the current quest. Python moves its exact physical card from enemy play to a cannot-ready Condition after damage. Centipede's damage blanks text while preserving traits, whereas its shadow blanks the full text box. Terrible Fever removes a committed hero, remains physically attached, and deals end-round damage. Biting Insects uses deterministic random physical hand discard and assigns the discarded card's cost among that player's characters. The Savage South discards five actual deck cards atomically, then removes controlled cards with matching titles, including foreign-owned attachments controlled with their host character.

Stampeding Oliphaunt triggers an actual Wild Mûmak attack against the first player or its printed Mûmak Trail fallback. Tiger cannot be optionally engaged and returns to staging after its attack destroys a character. All printed shadows and the four reused Jungle Forest cards resolve through the native engine.

## Verification

Focused scenario tests are in `tests/mumakil-scenario.test.ts`; declared browser fixtures are in `tests/mumakil-browser-fixtures.ts`. `scripts/browser-mumakil.mjs` exercises actual setup and controls at 1280, 390, and 320 pixels, reloads pending capture/Condition choices, verifies every promoted printed face, and checks original artwork hashes and browser image decoding. The focused scenario suite passes **39/39** tests, including actual engine actions for all four Capture objectives, native Python defense, held-shadow conservation during an immediate Python attack, and the stage-one Forced shuffle before Mûmak Trail’s optional search. The scenario browser suite passes **168/168 checkpoints**: 56 each at 1280, 390, and 320 pixels. It completes all eight standard/easy setups, advances through native quest resolution, reloads pending physical Capture choices, uses all four capture methods through real attack/defense/travel/quest controls, resolves native treachery and shadow effects, tests Python's physical conversion and Wild Mûmak's round-end choice, and produces both actual victory and combat defeat. All **23 original scenario faces** pass printed-text/image checks, pinned SHA-256 verification, and browser decoding. No JavaScript, image, overflow, or clipping errors were observed.

The completed browser proof is `output/mumakil-scenario/report.json`, with screenshots in that directory and the focused log in `output/mumakil-release/scenario-focused.log`. All browser checks used the same frozen candidate: `index-C6CX_j02.js`, **323,469 bytes**, SHA-256 `3a5fe4effa6bfd8a235e96cc66a9906bc231e79ff95ee4707632e711f4bcf983`. These local module-byte witnesses identify the tested artifact; deployment Git-SHA verification is recorded separately by the release process.
