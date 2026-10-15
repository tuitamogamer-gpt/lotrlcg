# The Long Arm of Mordor

The original Sands of Harad adventure supports standard and easy mode for one
to four players in local hot-seat. Its four original quests, nineteen encounter
identities and twenty-seven printed artwork faces use the immutable import
snapshot at `src/data/pending/the-long-arm-of-mordor-import.json`.

The publisher's original [MEC55 rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec55_rules_webready.pdf),
page 9, define objective-heroes, uncontrolled heroes in staging and guarded
heroes. The pinned PDF SHA-256 is
`dda538cf6c73514cdab24f2df02ddfc05e6cd3ee50d9d31f147e6858b84f2ba4`.
The original printed scans are authoritative where reference data differs:
Southron Boma has printed threat X, Sauron's Enforcers use the stage number,
Uruk Chieftain has no Victory value, and quest 1B requires successful progress
**on this stage**. The original easy encounter recipe retains both Mordor
Wargs. It therefore has twenty-three cards in the encounter deck before setup;
the standard deck has twenty-nine. Set-aside cards retain physical identities.

During setup each player chooses a different objective-hero in first-player
order and gives it two resources. Unselected objective-heroes are removed.
The player's original heroes retain their physical cards and original owner
while uncontrolled in the staging area. They are immune to player card effects,
their text boxes are blank, and they collect no resource-phase resources.
Objective-heroes are neutral heroes, collect normal resource-phase resources,
and can ordinarily pay only for neutral cards. The first card each player
plays each phase during stages 1 and 2 ignores the resource-match requirement.
Actual resource costs still apply. Losing an objective-hero eliminates its
controller even when its text box is blanked, as the publisher explicitly
makes that elimination text unmodifiable.

Successful main-quest progress at stage 1 and defeating stage 2 each return one
owned hero per player, exhausted. At stage 3 the remaining heroes are physically
guarded by distinct Orcs. The guards gain their printed stat bonuses and player
card immunity. Their actual defeat returns the exact guarded hero to its owner,
exhausted; progress cannot bypass outstanding guards. Guarded heroes are treated
as guarded objectives rather than ordinary character targets. This follows the
publisher's page 9 instruction and FAQ 1.23, under which a non-objective card
attached to another card loses its original type and becomes an attachment.

The final quest brings in the set-aside Uruk Chieftain, shuffles the encounter
discard into the deck and reveals one encounter card per player. Non-unique Orcs
receive the stage's engagement modifier. The Chieftain chooses among players
engaged with the most non-unique Orcs at the end of the encounter phase and
attacks immediately when it engages at the final stage. Its own immunity to
damage beside another engaged Orc and the final stage's prohibition on
non-combat damage both apply. Victory requires fifteen quest progress and the
Chieftain no longer being in play.

Kahliel, Firyal, Yazan and Jubayr have optional responses with their actual
targets, resource pools, top encounter card and physical shadows. Yazan's
objective-hero response is an encounter-card ability, so a guard's immunity to
player card effects does not prevent it. The original Mordor Orcs and Jungle
Forest sets implement current-stat comparisons, physical Mordor Warg mounts,
freshly revealed cards, travel costs, exploration effects, treacheries and
shadows. Mordor Warg retains its physical identity when it becomes an enemy
again after its host leaves play. Enforcers' end-of-round damage can target
uncontrolled staging heroes but cannot target guarded heroes as characters.

Saved games retain captured heroes, their owners and guard relationships,
set-aside cards, removed objective-heroes, pending rescues and shadow follow-ups.
Validation rejects corrupt ownership, duplicate guard assignments and invalid
combat counters. Public state shows captured faces and their guards without
revealing the encounter deck order.

Fear of Mordor records its affected physical allies in saved round markers.
The markers apply all three stat penalties, stack across repeated reveals,
survive text blanking and expire at round end. This also preserves saves when
Firyal discards a card and the next staging reveal is Fear of Mordor.

The focused engine suite passes 37 checks covering all eight original setup
combinations, the four quests, rescue ownership and exhaustion, mandatory
undefended damage, objective-hero elimination and all four responses, neutral
payments, guarded Orc immunity, physical Wargs, encounter effects and saved
combat continuations. Run with Node 22:

```sh
node --import tsx --test tests/long-arm-mordor.test.ts
```

The browser suite uses ordinary controls for fresh setups, quest resolution,
rescues, resource payments, Warg staging, travel, shadows, combat victory and
objective-hero loss. Declared fixtures establish specific mid-game positions;
subsequent decisions use the actual application and are restored from its
saved games. It reads every original encounter and quest face through the card
dialogs and checks each artwork's HTTP bytes, SHA-256 and browser decoding.
Reports identify the actual served JavaScript artifact and retain screenshots
at 1280, 390 and 320 pixels. Release results belong to the exact frozen artifact
recorded in the generated report.

The final release browser run passed all 162 checkpoints: 54 each at 1280,
390 and 320 pixels, with no browser errors. All 27 original faces passed the
printed-dialog, HTTP-byte, SHA-256 and image-decoding checks. The report at
`output/long-arm-mordor-final/report.json` records the served
`index-Dh90LEPq.js` module (320,685 bytes), with SHA-256
`3d44ef8acc1d771512210d05d5f9252586123540fea13fc450110819e7392a74`.
The interrupted earlier run is retained separately and is not counted as a
completed browser result.

After the Fear of Mordor save correction, 18 targeted browser checkpoints
passed at the same three widths. Both exact seed-11 states that exposed the
problem use an actual Firyal discard, the resulting Fear reveal and a complete
save/reload comparison. The targeted report at
`output/harad-release/mordor-fear-browser/report.json` identifies
`index-BmrW7b9_.js` (320,685 bytes), SHA-256
`0c9f9fd05dac3bb2b9d44cf21b24dc6a9f9d58643bb6ba8dc3fe3cb01084faad`.
The broader 162-checkpoint report remains scoped to its earlier artifact.
