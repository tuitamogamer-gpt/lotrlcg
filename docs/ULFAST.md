# The City of Ulfast

The original MEC79 pack adds a normal/easy scenario for classic solo and
one to four local players, with all eleven original player designs. Five
definitions are new; Lothíriel, Angbor the Fearless, Need Drives Them, War
Axe, Horn of the Mark and The Host of Galadhrim reuse existing handlers.
The next chronological pack is **The Challenge of the Wainriders**.

## Original sources

- [Original rules insert, MEC79](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC79.pdf),
  SHA-256 `704af7e3d43b9da4c72aa76d3edcafc2bb26f75c6659542cda315571e4c65ec6`.
- [Independent scenario inventory](https://hallofbeorn.com/LotR/Scenarios/The-City-of-Ulfast)
  supplies all 24 normal/easy quantity rows, retained in
  `tests/ulfast-source-quantities.json`.
- `tests/ulfast-art.json` pins URLs, byte lengths and SHA-256 for all **40
  visually reviewed original faces**: 28 scenario faces and twelve player
  faces, including the contract reverse. Original DragnCards scans remain
  local; six reused player designs retain their original-printing artwork.
- `src/data/pending/the-city-of-ulfast-import.json` preserves the original
  preparation snapshot, SHA-256
  `4ef061e09ee8363ddafd383b87019287f5f6659d0b8a1b41f9fcab5005f5cb94`.
  It is provenance; runtime definitions are separate files. The original
  reference catalogs are unchanged.

Both recipes retain their original physical sections and quantities:
**43 normal / 32 easy encounter cards plus four quests**. The setup section
is a search pool: only City Guard and one different location per player
begin in staging. Eight encounter designs reuse the Servants of Sauron and
Under Guard sets. The original pack itself contains 31 encounter/quest
cards and 29 player cards, totaling 60.

Printed scans correct the incomplete upstream records: quest reverses have
5/10/15/20 quest points and each round-end resource instruction; six missing
shadows are restored on The King's Elite, Ulchor's Agent, Streets of Ulfast,
Extra Vigil, We've Been Seen and Patrolling the Streets. Cat and Mouse has
10 quest points, Victory 10 and a When-defeated response. Extra Vigil's
threat increase is a cost. City Guard's printed attack is **9**; the insert's
introductory example says 8, so runtime follows the actual card. The Three
Hunters contract has separate front and reverse text/images.

## Scenario behavior

The four main quests have independent resource counters. Advancement
discards old quest attachments, resets resources and resolves each player's
stage-front choice before exposing the next reverse. The last stage adds
one enemy per player without revealing its text. Winning requires both
20 progress and no remaining City Guard hit points.

City Guard remains one physical staging-area enemy. Its X threat, engagement
cost modifiers, each player's effective threat and Crowded Market determine
which players it is considered engaged with. Each qualifying player receives
one normal attack, with fresh shadows. It is immune to player effects,
indestructible and cannot leave staging. Quest reverses impose total damage
limits of 5/10/15/20, including when the next reverse enters play.

All printed encounter/travel/shadow effects are implemented, including
Ulfast Sentry's resource-or-attack decision, Elite's resource per attack,
Lawn's additional refresh threat, Archway's threat-reduction restriction,
physical Extra Vigil attachments and their paid optional removal, excess
combat damage, additional attacks and per-seat We've Been Seen choices.
Patrolling the Streets blocks the current quest for the current phase.

The reused sets retain Servant's first-player ownership and once-per-phase
threat response, Messenger's choice, Overwhelmed's round protection,
Catacombs/Side Street staging restrictions, Under Guard travel repeats and
both encounter side quests. Deferred choices, nested attacks, resolving
treacheries and original card quantities survive saves. Public views expose
counts rather than concealed deck order.

## New player rules

| Card                      | Automated behavior                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Woodland Sentry           | Optional response only when played from hand; discard a matching enemy/location if a copy is in the victory display, respecting immunity.                                                                                                                                                                                                                                                            |
| Keen Longbow              | Lore-hero targeting, limit one, Restricted and Ranged; select up to three actual hand cards, pay the complete discard cost, then deal damage before normal attack resolution.                                                                                                                                                                                                                        |
| Strength and Courage      | Ring-bearer targeting, limit one and +1 attack; exhaust the controlled One Ring and pay threat before doubling printed attack for this attack only.                                                                                                                                                                                                                                                  |
| Knight of Belfalas        | Optional Gondor-ally recovery from its controller's discard after any entry; respects discard restrictions and source survival.                                                                                                                                                                                                                                                                      |
| Forth, The Three Hunters! | No allies in the deck; begins outside the draw deck. Each own hero has one extra restricted slot. Side A discounts the first restricted attachment played on each own hero per round. Optional Refresh action flips when every own hero has two restricted attachments. Side B grants willpower per restricted attachment and exhausts to heal each own hero; it stays flipped and readies normally. |

The contract's deck restriction does not prohibit putting allies into play.
Raiment of War explicitly counts as two Restricted attachments for capacity,
flipping and willpower. Contract ownership, side, exhaustion, discounts, healing and removal
on player elimination are saved. The UI provides the actual flip/heal
actions and both card faces.

## Verification

```sh
npm run check
npm run test:engine
npm run test:ulfast-simulation
npm run build
npm run test:browser-ulfast
npm run audit:rules
```

Focused tests exercise setup quantities, stages, victory, travel, shadow
timing, conditional destruction, paid responses, multiplayer ownership,
restricted capacity, physical source lifetime, corruption rejection and
save restoration. The dedicated matrix runs fourteen complete normal/easy
games, with six exact comparisons across all event-review modes. Every
action restores its save; boundary observers check physical quantities,
privacy and rendering purity. Starter-deck simulations end in defeat;
separate native engine and browser actions verify victory.

The browser suite exercises native one-to-four-player setup, stage choices,
all four quest fronts/reverses, travel, final victory and all five new player
designs at 1280/390/320 pixels. It checks reloads during pending choices,
served production module bytes and all 40 original image hashes/decodes.
Evidence is retained under ignored `output/ulfast-browser/` and
`output/ulfast-release/`. CI includes the scenario matrix and browser suite.
The additive account-choice SQL migration is covered by local database tests;
no hosted account database migration is claimed.

The registration audit now records **719 player definitions (81 heroes),
1,130 encounters and 77 scenario designs**, resolving **2,092/4,183 reference
identities and 154/355 recipes**. There are 2,091 identities still pending.
These counts describe registrations; the tests above provide semantic evidence.

## Recorded checks · 28 October 2026

- The full Node 22 engine run passed **5,635 tests**. The final Restricted-count
  correction then passed **66 focused scenario, player, source, deck and database
  checks**; the final unknown-card validation guard passed **29 player/deck checks**.
- The completed Node 22 matrix passed **14 games and six exact review-mode
  comparisons**, with **1,552 action/save restorations**, 602 physical/render
  boundaries and 1,513 privacy comparisons. An environment-interrupted rerun
  is excluded from these completed totals.
- The full browser run passed **68 checkpoints**, eight native normal/easy
  setups and all **40 original face hashes/decodes**, with zero errors at
  1280/390/320 pixels. Its artifact is `index-BFzEmm7o.js`, SHA-256
  `09a1d2f6d7dd7d1980a55fc211c8a52de36256c1735bb28067c21555d1b5b8ae`.
  A separate final-build smoke check covers native setup, the Raiment flip,
  its two willpower and healing after the input-validation-only guard.
- TypeScript, the production build, immutable reference hashes, the coverage
  audit and whitespace checks pass. Earlier incomplete browser attempts are
  excluded; final evidence is in `output/ulfast-release/` and the browser report.
