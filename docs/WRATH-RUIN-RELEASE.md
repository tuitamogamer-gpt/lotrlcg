# Wrath and Ruin release

The original **MEC78 Wrath and Ruin** adds one normal/easy scenario for
classic solo and one to four local players, together with all eleven player
designs. Seven are newly registered; Thorin Stonehelm, Soldier of Gondor,
Pillars of the Kings and Silver Circlet reuse existing rules. The next
chronological pack is **The City of Ulfast**.

## Sources and rules

[The source review](WRATH-RUIN-SOURCES.md) records all 39 visually checked
gameplay faces, original inserts, image hashes and independent normal/easy
quantities. The immutable source recipe omitted Warriors of the East.
The promoted recipes restore its one copy, resulting in **50/38 encounter
cards plus two quests**, with player-count-dependent setup drawn from that
physical pool. Five missing shadow texts are restored from the original scans.

[Scenario rules](WRATH-RUIN.md) cover the siege, controlled city locations,
end-of-round advancement, Ulchor, the Gate, Fury, private Tavern cards and
shared Easterling mechanics. The interface shows the actual controlled
locations and owners, staging comparison and current quest requirements.

[Player rules](WRATH-RUIN-PLAYER-SCRIPTS.md) cover Tom Bombadil's physical
Encounter lifecycle, saved Charge into Battle attacks, Durin's Axe,
Inner Strength and Cautious Halfling. The shared Pillars implementation now
uses the ordinary threat-increase path so printed threat reactions occur.

[The Burglar's Turn](BURGLAR-CONTRACT.md) has a separate fourteen-card loot
list in custom decks. Drafts, local storage, recovered games and setup retain
that selection. Its loot stays outside the fifty-card draw deck, which cannot
include attachments. Travel and exploration use actual guarded attachments
with ownership, legal targets, saved choices and private deck order.

## Current Encounter keyword

The publisher's revised Angmar Awakened Hero Expansion insert permits each
player to set aside **up to three copies of each Encounter design**. The
setup interface provides an independent 0–3 selector for each relevant type,
including Tom Bombadil. Each count is validated independently. Older saves
and explicit allocations remain legal; no existing allocation is expanded
when restoring it. The source review quotes and pins both printed versions.

## Verification

```sh
npm run check
npm run test:engine
npm run test:wrath-ruin-simulation
npm run build
npm run test:wrath-ruin-quests
npm run test:wrath-ruin-players
node --import tsx scripts/browser-batch4-reserves.mjs
npm run audit:rules
```

The dedicated matrix runs fourteen complete games: normal/easy one to four
players, plus exact two-player comparisons of all three review modes.
Every action is saved and restored. Phase/seat/stage boundaries also check
physical card quantities, private deck orders and pure public rendering.
Native semantic and browser fixtures separately exercise the printed win.
Browser suites cover 1280, 390 and 320 pixels and verify the served production
module's actual bytes. Evidence is retained in the ignored
`output/wrath-ruin-release/`, `output/wrath-ruin/` and
`output/wrath-ruin-players/` directories.

Recorded on 26 October 2026:

- TypeScript and the production build pass. The full engine run passes
  **5,580/5,580 tests**, including 53 scenario, 30 player, 31 contract,
  ten integration and six source tests.
- All **14 complete games** pass with six exact review-mode comparisons,
  **2,077 action/save restorations**, 757 physical/render/idempotence
  boundaries and 1,933 privacy comparisons. These seeded starter-deck games
  end in defeat; separate native and browser fixtures verify the printed win.
- The final browser runs pass **252 checkpoints**: 168 scenario checks
  (including 30 native setups), 75 player/contract checks and nine reserve
  regressions. All 39 original gameplay faces are checked, with no browser
  errors at 1280, 390 or 320 pixels.
- All 65 HTTP 200 main-module witnesses match `index-KiG63dAx.js`, SHA-256
  `cb455f458728d60a07fbfa6a919be4fbf7847e66a8a907400ade0eb2a01339ca`.
  The release evidence also pins 2,661 build input files; browser runs use
  that unchanged production artifact. Supplemental screenshots show all
  four Encounter reserve controls at desktop and mobile widths.

The audit records **714 player definitions (81 heroes), 1,118 encounter
definitions and 76 scenario designs**: **2,071 of 4,183 reference identities**
and **152 of 355 recipes**. There are 2,112 reference identities pending.
The 629 selectable nonhero definitions include two contracts; four other
player definitions have the Encounter keyword.
