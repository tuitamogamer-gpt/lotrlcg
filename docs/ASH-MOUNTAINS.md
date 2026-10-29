# Under the Ash Mountains

The original MEC81 pack adds its normal/easy adventure for classic solo and
one to four local players, with all eleven original player designs. Nine
runtime definitions are new; Gildor Inglorion and Valiant Sword reuse their
existing rules. The next chronological pack is **The Land of Sorrow**.

## Sources and corrections

- [Original rules insert, MEC81](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC81.pdf),
  SHA-256 `d098ad82070b0cd6bd3e6c7cd81a39ca9cfdcb2c7cf46e5639c155b09b5c5f8f`.
- [Independent normal/easy inventory](https://hallofbeorn.com/LotR/Scenarios/Under-the-Ash-Mountains),
  retained as all 21 rows in `tests/ash-mountains-source-quantities.json`.
- `tests/ash-mountains-art.json` pins source URLs, byte lengths and SHA-256 for
  **34 visually reviewed original faces**: 23 scenario faces and eleven
  player faces. Both quest reverses are included. The existing Gildor
  printing remains unchanged; its original pack scan uses `22081.UtAM.jpg`.
- The immutable preparation snapshot is
  `src/data/pending/under-the-ash-mountains-import.json`, SHA-256
  `39ede38ef996dfaf2ed884bd84ba7db7ab19325e5a1840231b6fe885745d5377`.
- [Collected designer rulings](https://alongextendedparty.com/semi-official-errata-faq-1-10/),
  items 3.367 and 3.391, clarify Helm of Secrecy: retain ready/exhausted state
  and bring in a hero with no damage. Its latest printed text removes the
  contradictory instruction to transfer damage tokens.

Recipes Q09.7/E09.7 contain **38 normal / 29 easy encounter cards plus two
quest cards**, totaling 40/31 physical cards. Five encounter designs reuse
Twisting Tunnels. The upstream recipe omitted one Ash Mountain Werewolf
in both modes; runtime recipes restore the independently verified three
copies. The original preparation remains unchanged. Fiery Chasm's pack
quantity is three and Orc Passage's is two. The original pack contains
31 scenario cards and 29 player cards.

Scans restore the quest reverses, three Victory 10 encounter side quests,
missing printed shadows, and the shared Twisted Tunnel shadow. Original
reference catalogs and the official player snapshot remain immutable.

## Scenario rules

Setup trims each deck to forty after opening hands, stages a Patrol, asks
each other player for a different location, and reveals an encounter side
quest. Both main stages require 25 progress. Stage two reveals a chosen
encounter side quest and adds one enemy per surviving player without
triggering When Revealed effects. Completing stage two wins.

The end-of-round supply cost is one plus the number of quest cards in play.
Empty decks cause elimination **at the end of the round**, with multiplayer
elimination handled for every affected seat. Main quest text prevents event
cards from shuffling discards into player decks; non-event recovery works.
Patrol limits main-quest progress to five per round while staged, including
progress placed earlier that round, and makes an immediate engagement attack.

Hideous Deeps holds the actual top three cards of each player's deck face
down. Active exploration returns and shuffles them into their owners' decks;
other departures discard them to their owners. Lost in the Dark holds ten
cards under each player's threat dial, discards one per threat increase,
and returns the remainder on defeat. Saves retain exact identities and
ownership; public views show counts. Elimination cleans up held cards.

Tunnels require legal travel and three active locations explored before
progress can be placed. Haunt limits each enemy to four actual damage per
round and blocks its selection while an enemy is staged. Overwhelming
Darkness discards after each played card and optionally recovers the top
three discards for each player when defeated. All printed encounter and
shadow effects are implemented, including delayed damage replacements,
post-attack destruction and excess damage, cancellation restrictions,
character blanking, readying restrictions and per-player choices.

## Player cards

| Card                | Behavior                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wandering Exile     | After commitment, optionally discard a hand card to ready the Exile.                                                                                                                               |
| Stone of Elostirion | Guarded (location), Restricted, +2 hero willpower and one extra resource-phase draw for its controller.                                                                                            |
| Well Preserved      | Ring-bearer only, +1 hit point; at round begin exhaust the controlled Ring and raise threat before healing all damage.                                                                             |
| Northern Bowmaster  | Requires an engaged enemy when played from hand; putting it into play remains legal.                                                                                                               |
| Reckless Attack     | Doomed 2; each player deals two damage to an eligible engaged enemy they choose.                                                                                                                   |
| Odo Proudfoot       | Optionally searches the top five cards for a Hobbit ally and shuffles the rest.                                                                                                                    |
| Defiant Challenge   | Doomed 2; each player may ready one of their controlled characters.                                                                                                                                |
| Helm of Secrecy     | Clears the chosen hero's tokens, offers eligible registered collection heroes, preserves exhaustion and transfers legal attachments. Returned heroes keep physical identity in collection custody. |
| Council of the Wise | Validates one copy per title, starts in play and rewards events played from hand with threat reduction, a draw or a hero resource, each once per round.                                            |

Council rewards occur after the event finishes resolving; replayed discard
or deck events do not trigger it. Pending reward/hero/collection choices,
paid costs, hidden cards and contract limits survive save/reload. The One Ring is immune to Helm's non-Master effect: it cannot transfer and
leaves play with its old bearer, causing defeat. Hero uniqueness is checked
across the whole table.

## Verification

```sh
npm run test:engine
npm run test:ash-mountains-simulation
npm run build
npm run test:browser-ash-mountains
npm run audit:rules
```

The focused suite covers native one-to-four-player normal/easy setup,
source quantities and art pins, quest transitions/victory, supply timing,
physical hidden-card custody, shadow rules, damage replacements, player
cards, contracts, ownership and invalid saves. The dedicated complete-game
matrix uses eight baseline games and six paced games, checking exact save
restoration after every action and physical conservation/private views at
phase and seat boundaries. CI includes dedicated simulation and browser jobs.

The browser suite uses real controls at 1280, 390 and 320 pixels, native
normal/easy setup, saved pending choices, both quest faces, victory,
contracts and player actions. It also verifies all 34 served image hashes
and decodes and the exact production module bytes. Evidence stays in ignored
`output/ash-mountains-browser/` and `output/ash-mountains-release/`.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database. The registration audit records **737 player
definitions (82 heroes), 1,155 encounters and 79 scenario designs**, resolving
**2,143/4,183 reference identities and 158/355 recipes**. There are 2,040
identities still pending. Registration totals are separate from semantic
and browser evidence.

## Recorded checks · 29 October 2026

- The Node 22 full engine run passed **5,735 tests**, with no failures or
  skips. The final scenario/player/source/Ring regressions passed **90
  checks**; the additional foreign-owner return regression also passes.
- The complete-game matrix passed **14 games** and **six exact review-mode
  comparisons**, with **1,698 action/save restorations**, **719 physical and
  render boundaries**, and **1,785 privacy comparisons**. Starter-deck games
  ended in defeat; focused engine and browser actions separately verify victory.
- The final browser run passed **68 checkpoints**, all **eight native
  normal/easy setups**, and all **34 original image hashes and decodes** at
  1280/390/320 pixels, with zero page or console errors. Desktop and mobile
  screenshots of supply counts and saved contract choices were reviewed.
- The production entry is `index-CAAavCAT.js`, **411,275 bytes**, SHA-256
  `6f1768fdc30fa2af89d7a9776d8becf6a31f3ceee401f6cfb002b20a49775b85`.
  All 21 actual HTTP 200 module observations match those bytes. All 772
  source-file hashes remain unchanged since that build, and the served
  coverage artifact matches the current audit.
- TypeScript, the production build, account SQL tests, formatting, immutable
  sources and the registration audit pass. Interrupted browser attempts are
  excluded from the final report and these totals.
