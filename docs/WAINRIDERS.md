# Challenge of the Wainriders

The original MEC80 pack adds a normal/easy scenario for classic solo and
one to four local players, with all eleven original player designs. Nine
definitions are new; Golden Belt and Muster of Rohan reuse existing rules.
The next chronological pack is **Under the Ash Mountains**.

## Original sources

- [Original rules insert, MEC80](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC80.pdf),
  SHA-256 `0e934d06b9f7ae86b28c8e569c4c1b8e0931392a4d3d73fa0ffd4283024efd43`.
- [Independent scenario inventory](https://hallofbeorn.com/LotR/Scenarios/Challenge-of-the-Wainriders)
  supplies all 25 normal/easy quantity rows, retained in
  `tests/wainriders-source-quantities.json`.
- `tests/wainriders-art.json` pins source URLs, byte lengths and SHA-256 for
  all **43 visually reviewed original faces**: 31 scenario and twelve player
  faces, including all quest reverses and The Grey Wanderer reverse.
- `src/data/pending/challenge-of-the-wainriders-import.json` preserves the
  original preparation snapshot, SHA-256
  `f774dbc82812224abb563cc6784f6152bf5ce7163c51b98bc81427e31c1f31ca`.
  Runtime corrections are separate. The original reference catalogs and
  official player-card snapshot remain unchanged.

Recipes Q09.6/E09.6 retain **42 normal / 32 easy encounter and objective
cards plus six quests**, totaling 48/38 physical cards. Eight encounter
designs reuse the Riders of Rhûn and Rolling Plains sets. The original
pack itself contains 31 encounter/quest cards and 29 player cards.

Printed scans restore omitted racing results, shadows and reverse-side
instructions. All six quest reverses have Race and gain four quest points
per player; their setup fronts do not have Race. Wainrider Champion has
printed X threat and defense, each two per player, four attack and five
hit points. The shared Arduous Journey has six quest points.

## Scenario behavior

All six quest cards stay in play through two circuits, retaining their
attachments. The public circuit shows both racers, the current quest,
progress, rival damage and the last racing test. Defeated-stage progress
clears at the end of the quest phase. Race prevents player-card progress
and defeat outside questing. Passing transfers excess progress; failures
on stages one to five still advance but apply the printed penalty. A failed
Home Stretch test clears progress without completing that stage. Completing
the second circuit wins; the rival completing it loses.

The first player exhausts one of their ready characters for the printed
willpower, attack or defense racing test. The atomic encounter discard
uses its current statistic and straight/turn/wild results. Required matches
increase with earlier stages completed that round and staging Ravine Ledges.
An empty deck is not refilled in the middle of this atomic discard. Pending
tests, discarded results, costs and continuations survive save/reload.

Wainrider Champion remains a single immune, indestructible staging enemy.
It is considered engaged with every player when both racers occupy the
same physical stage, even on different circuits. Every actual attack gets
fresh shadows. Rival damage advances independently, carrying overflow;
remaining enemy staging threat supplies damage at quest end.

All printed encounter, travel and shadow rules are implemented: Racer's
conditional Surge and post-attack kill damage, Driver's damage-or-attack
choice, Veteran's staging restriction, optional Narrow Pass damage
replacement, Crowded Track's per-player enemy search, Ravine's travel test,
physical Chariot attachments and excess damage, and The Champion's Cunning
attacks or rival damage. Shared Rider/Plains rules retain their original
timing, searches, attachments, fatigue and refresh behavior. Hidden deck
order stays outside public views; all physical encounter zones are counted.

## New player rules

| Card                 | Automated behavior                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saruman              | Caps his controller's player-card threat reduction at one; supplies conditional resource icons for printed Doomed events; optional ready after playing a Doomed card, including a keyword reduced to zero.                                                                                                                                                                |
| The Power of Command | Ring-bearer attachment, limit one, +1 willpower; after committing, pays the controlled Ring exhaust and one threat before boosting other controlled unique characters for the phase.                                                                                                                                                                                      |
| Horns! Horns! Horns! | Doomed 2; each player may put an actual hand ally into play. Entry rules resolve normally. Surviving physical allies return to their owners' shuffled decks at phase end.                                                                                                                                                                                                 |
| Soldier of Isengard  | Doomed 2; optional control transfer after a player actually raises threat from Doomed, preserving the card's owner, attachments and physical identity.                                                                                                                                                                                                                    |
| Far-sighted          | Doomed 1; privately inspect the top five encounter cards in order without changing the deck.                                                                                                                                                                                                                                                                              |
| Nori                 | After his attack destroys an enemy, optionally move his controller's current top discard to the bottom of their deck, respecting discard restrictions.                                                                                                                                                                                                                    |
| Rohirrim Scout       | Pays its discard cost before choosing an eligible nonunique staging enemy; blocks automatic engagement against its controller for the round.                                                                                                                                                                                                                              |
| Saruman's Staff      | Restricted, unique, Saruman-only; exhaust before reducing the next printed Doomed event this phase by two, or searching the top five for a Doomed event and shuffling.                                                                                                                                                                                                    |
| The Grey Wanderer    | Requires one starting hero. Before opening hands, search for a printed-cost-one attachment and put it into play on a legal target, then flip. Side B waives resource matching for the first nonunique card played each planning phase. Exhaust and pay one threat before choosing two distinct options: ready the starting hero, add two resources, or heal three damage. |

Contract identity, side, exhaustion, original hero and controller survive
saves and multiplayer changes. The contract readies in refresh, respects
hero healing restrictions, and is removed with its eliminated player.
Printed Doomed and gained/reduced Doomed retain separate timing; putting a
card into play does not trigger a response that requires playing it.

## Verification

```sh
npm run test:engine
npm run test:wainriders-simulation
npm run build
npm run test:browser-wainriders
npm run audit:rules
```

Focused checks cover native normal/easy setup, racing results and penalties,
both racers' end conditions, persistent quest attachments, virtual
engagement, shadows, paid replacements, all new player rules, multiplayer
ownership, saved costs, private views and malformed-save rejection.

The dedicated matrix completed **14 games and six exact event-review
comparisons**, with **1,897 action/save restorations**, 814 physical/render
boundaries and 1,986 privacy comparisons. All starter-deck games ended in
defeat; separate native engine and browser actions exercise victory.

The browser suite uses real controls at 1280/390/320 pixels for native
one-to-four-player normal/easy setup, racing and travel tests, all six quest
fronts/reverses, second-circuit victory, player actions and Grey Wanderer
setup. It verifies pending-choice reloads, all 43 served original image
hashes/decodes, and the exact production module bytes. Evidence is retained
under ignored `output/wainriders-browser/` and `output/wainriders-release/`.
CI includes dedicated scenario-matrix and browser jobs. The additive
account-choice SQL migration is included; no hosted migration is claimed.

The registration audit records **728 player definitions (82 heroes),
1,141 encounters and 78 scenario designs**, resolving **2,118/4,183 reference
identities and 156/355 recipes**. There are 2,065 identities still pending.
Registration totals are distinct from the semantic evidence above.

## Recorded checks · 28 October 2026

- The Node 22 engine run passed **5,681 tests**, with no failures or skips.
  The retained-quest attachment correction also passed **180 focused
  regression/source checks**; all **45 Wainriders-specific checks** pass.
- The completed simulation matrix passed fourteen games and all six exact
  review-mode comparisons. Its detailed counters are recorded above.
- The final browser suite passed **95 checkpoints**, eight native
  normal/easy setups and all **43 original face hashes/decodes**, with zero
  console/page errors at 1280/390/320 pixels. Desktop and mobile screenshots
  of racing choices, contract actions and quest inspection were reviewed.
- The frozen production entry is `index-CNuxTraf.js`, 408,268 bytes, SHA-256
  `39694053676ea7854132856c6add095207f3df2ef6224f4159e469babccdcf62`.
  All 761 source-file hashes remain unchanged since that build. TypeScript,
  the build, account SQL tests, formatting, immutable source checks and the
  registration audit pass. Incomplete browser attempts are excluded from
  the final report and these counts.
