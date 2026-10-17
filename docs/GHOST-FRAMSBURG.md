# The Ghost of Framsburg — original MEC69

Implemented for one through four players in standard and easy mode. This uses
the original adventure, without later campaign or Nightmare material.

The immutable source bundle is
[`the-ghost-of-framsburg-import.json`](../src/data/pending/the-ghost-of-framsburg-import.json):
23 original card identities, including three double-sided quests, and 26
original image faces. Its SHA-256 is
`ceaaffbfc9b4428f094f1ee6018473bbe38c781c6572c88a46fd5443219cbeb0`.
The original [publisher insert](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec69_web_the_ghost_of_framsburg_rules.pdf)
is 2,766,475 bytes, SHA-256
`c6f6060e32f4a6f4a2abdb6ff81b7fac1935be28152097c093a99a549f263839`.
Page 1 confirms difficulty 5 and the Ghost of Framsburg, Wild Creatures and
Afraid of the Dark encounter sets. Page 2 defines Discover X and Loot.

## Printed source corrections

The catalog and original import remain unchanged. Runtime corrections were
checked against the original cached card scans and the
[original inventory](https://hallofbeorn.com/LotR/Scenarios/The-Ghost-of-Framsburg).

| Original card          | Runtime correction                                                                   | Original scan                                                     |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| The Cursed Tomb, #97   | Victory 5, omitted from the raw catalog; “the players travel”                        | [front](../public/cards/315c85eb-9c20-46a1-b445-e5197cd15032.jpg) |
| Crypt Stalker, #99     | Threat X; attack, defense and threat use the tens digit of the first player's threat | [front](../public/cards/36ac198d-0248-464a-8919-36f96b8e7caf.jpg) |
| Evil Spectre, #100     | Engagement 35, rather than 40                                                        | [front](../public/cards/62d814e4-e0cf-437b-8ee7-b26478beb721.jpg) |
| Forgotten Crypt, #101  | Victory 2, omitted from the raw catalog                                              | [front](../public/cards/11c67697-29da-4c76-bf89-985c2c036940.jpg) |
| Haunted Hall, #102     | Its ability refers to Haunted Hall, rather than the catalog's “Dark Hall”            | [front](../public/cards/8c4cc797-13e6-4ee4-a991-7ec76866418a.jpg) |
| Hidden Staircase, #103 | Threat X, rather than 0                                                              | [front](../public/cards/4bae8841-e3e4-4a93-b10f-8544eaab9cb3.jpg) |
| Moonlit Passage, #104  | Restore shadow: “Raise your threat by 1.”                                            | [front](../public/cards/ed7b5f3e-432b-4dd7-85f9-6dea5ff62d3d.jpg) |
| Slammed Shut, #108     | “chooses and exhausts,” rather than “chooses an exhausts”                            | [front](../public/cards/f5a65abc-e3df-4d26-aeed-2a3b1effb005.jpg) |

The raw easy recipe includes two Crypt Stalkers. The original inventory lists
two standard and one easy. Only this easy quantity changes: runtime standard
contains 45 total physical components and runtime easy contains 33 (the raw
easy bundle has 34). Standard has 41 encounter cards before setup searches;
easy has 29. The three quests and one set-aside Cursed Tomb account for the
remaining four cards. The five locations listed under raw `sharedStagingArea`
are combined with the encounter deck so each player actually searches for a
different location as printed on 1A. After setup, the encounter deck therefore
contains `41 − players` or `29 − players` cards. Raw recipe sections remain
available in the immutable bundle.

The five original Wilds definitions are reused directly: Giant Spider, Black
Bats, Werewolf, Afraid of the Dark and Eyes in the Dark. Their effects and
shadows are explicitly routed by the Ghost scenario hooks.

## Rules and physical state

Discover removes the top X actual cards into a temporary looked-at pile,
reshuffling the discard into the encounter deck first when fewer than X remain.
The resolving player chooses one Loot objective; the seeded random generator
selects one Hazard. The chosen objective remains guarded by the active
location, the Hazard follows normal reveal timing, and the other cards are
discarded after that reveal resolves. An ordinary encounter reveal of Loot
discards it and reveals a replacement. Hidden Staircase reduces each player's
threat only when its discovery reveals no Hazard. Its reduction uses the
printed X, independently of Crypt Key's adjustment to Discover.

Guarded Loot keeps its physical ID. On guard departure it becomes unattached
in play; the current first player chooses a hero he controls to claim it, and
the same ID becomes that hero's objective attachment. Controlled Loot does
not automatically follow later first-player changes. When its attached hero
leaves play, Loot follows the ordinary attachment discard rule; these cards
do not contain the Three Trials keys' explicit return-from-discard instruction.
Forgotten Crypt discards until an Undead enemy is found, adds it to staging,
and lets the resolving player select a discarded Loot objective for that enemy
to guard.

Crypt Key is an optional response controlled by the actual bearer. It exhausts
that physical attachment and changes the location's Discover value before
resolution. The modification remains on that physical location until it leaves
play, so Old Lantern reads the same value. Old Lantern chooses a player to
look at his own top X cards, takes one, and allows the rest to be ordered on
the bottom. Scatha's Teeth exhausts both the actual attachment and bearer and
reduces the selected player's threat by 2. It is an encounter objective, so
Moonlit Passage's player-card reduction limit does not apply to that benefit.

Quest 1 requires six progress and one controlled Loot; quest 2 requires twelve
progress and two controlled Loot. Quest 2's forced beginning-of-quest choice
and its initial encounter reshuffle/reveals apply in player order. Quest 3
adds the physical Tomb and lets every other player search for a non-unique
Undead enemy. Tomb travel requires three controlled Loot and makes Fram's
Shade attack each player in turn order. Exploring the Tomb scores five victory;
Shade gains victory six while the Tomb is in victory. Quest 3 requires six
progress and Shade in the victory display.

Fram's Shade's threat, attack and defense follow the current controlled Loot
count. Its shadow replacement applies to ordinary, immediate and additional
shadow deals. Immunity comes from quest 3. Its attachment restriction permits
objectives. Crypt Stalker's variable stats and attack threat trigger, Evil
Spectre's Dark destruction reshuffle, all location forced effects, encounter
treacheries and original shadows have native effects. Temporary stat penalties,
ready restrictions and shadow damage protection retain their printed round
or phase duration.

Save validation checks the ordered quest chain, physical special-zone IDs,
allowed encounter codes, guard links, seat indices and timed modifiers.
Pending choices resume through ordinary serialized effects. The public state
and scenario panel expose hidden pile counts, with no encounter-deck order or
unselected looked-at card identities.

## Verification

`node --import tsx --test tests/ghost-framsburg-import.test.ts tests/ghost-framsburg-scenario.test.ts`
passes 34 tests, including every one-to-four-player setup in both modes,
pending-discovery reloads, physical Loot ownership at every seat count, quest
gates, native travel, final victory and hero-elimination loss, objectives,
continuous effects, original shadows, shared Wilds rules and malformed saves.

`node --import tsx scripts/browser-ghost-framsburg.mjs` exercises native setup,
Discover choices and random Hazard resolution, quest exploration and Loot
claiming, encounter reveals, and the final attack at 1280, 390 and 320 pixels.
It inspects all 23 original card identities and all three quest backs, checks
all 26 source-image bodies and browser decodes, and records exact built
artifact body evidence with the shared browser witness helper. The runner
writes its completed evidence to `output/ghost-framsburg/report.json`.
