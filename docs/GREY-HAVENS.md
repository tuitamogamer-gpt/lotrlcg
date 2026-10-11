# The Grey Havens original deluxe

This import implements all fifteen original player designs and all three
original standard/easy adventures for classic solo and 1–4 players in local
hot-seat. Revised Dream-chaser campaign additions and Nightmare variants retain
their separate support gates. Flight of the Stormcaller is the next
chronological Adventure Pack.

## Sources and rules

- [Source snapshots, exact recipe zones, printed fields and cached artwork](GREY-HAVENS-SOURCES.md)
- [Sailing, Heading, ship combat and Boarding](GREY-HAVENS-SAILING.md)
- [Voyage Across Belegaer](VOYAGE-BELEGAER-RULES.md)
- [The Fate of Númenor](FATE-NUMENOR-RULES.md)
- [Raid on the Grey Havens](RAID-GREY-HAVENS-RULES.md)
- [All fifteen player-card implementations](GREY-HAVENS-PLAYER-SCRIPTS.md)

The pinned reference catalog remains unchanged. Three provenance snapshots
retain 72 original encounter-side identities and 96 cached face entries;
five rulesheet references are excluded from playable registration. Player
records retain their original codes, text and product provenance. Local scans
include every front/reverse and all fifteen player designs. The source notes
identify the authoritative current publisher PDF and transcription corrections.

## Integration

Scenario selection, hero/deck support, printed current quest faces, fleet and
special-zone counters, action controls and saved choices use the implemented
runtime registrations. Uncharted identities and private quest-deck order remain
hidden from other seats and public state. The additive account-choice migration
admits the three scenario IDs; database and RLS behavior is tested locally.

`npm run audit:rules` reports 511 player definitions, 58 heroes, 452 ordinary
deck cards, 683 encounters and 48 scenarios. Registered automation resolves
1,347/4,183 reference identities and 96/355 recipes; 2,836 identities remain
pending. Inventory counts record support registration; gameplay evidence is
maintained separately.

## Reproducing verification

Use Node 22 and `npm ci`.

```sh
npm run check
npm run test:engine
npm run build
npm run test:grey-havens-simulation
npm run test:browser-grey-havens
```

The dedicated rules suites exercise printed timing, costs, immunity, physical
ownership, choices, hidden information, progress replacement, victory/loss and
save restoration. The complete-game matrix plays all three scenarios in both
modes with 1–4 players, restores after every action, and compares immediate
resolution with all/hidden/decisions event-review modes. Existing solo and
hot-seat drivers include Sailing and legal ship defense.

The final local engine run passes all 3,360 tests. The five focused Grey Havens
suites contain 143 semantic tests: 31 Voyage, 38 Fate, 28 Raid, 37 player-card
and nine shared Sailing cases. Their edge cases include original/easy setup,
Sword-thain, countered event costs, draw restrictions, redirected damage,
Uncharted deck isolation and ordered entry responses.

Browser suites exercise actual controls, every cached face, pending-choice
reloads, private islands, ship combat and player-card costs at desktop and mobile
widths. `GAME_URL` selects a stable production preview; generated reports and
screenshots are kept under ignored `output/` directories. CI runs the new
semantic, complete-game and browser checks alongside the existing suites.

All four browser suites pass on the same frozen production build: 46 Voyage,
24 Fate, 20 Raid and 24 player-card interaction checkpoints, plus three complete
player-art checks. Desktop/mobile screenshots were inspected and there were no
browser errors. Twenty-four complete games also pass against the final runtime
(all three scenarios, both modes, 1–4 players), with restoration after every
action. Core learning decks lose these stress games; dedicated semantic and
actual-control browser fixtures separately verify victory.

The full 96-game review matrix passes all six scenario/difficulty cases, with
72 final-rule-state equality assertions. Those processes loaded their modules
before the final Compass/Uncharted, Rolling Seas travel-cost, Raid entry-hook
and Calphon elimination-boundary fixes. The 24 final-runtime games provide
3,332 save/restore round trips after those changes, and dedicated semantic and
browser cases cover the changed paths. Existing pacing and hot-seat browser
regressions also pass. The complete 192-game seeded hot-seat breadth is assigned
to CI; it is not claimed as a local result.

Local evidence is recorded in `output/grey-havens-simulation/report.json` and
the four browser report directories. Generated screenshots, evidence logs and
build fingerprints remain outside the source commit.
