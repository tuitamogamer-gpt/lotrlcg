# Fire in the Night — original scenario

The original MEC68 scenario runs in normal and easy mode for one to four players. The single main quest has 50 quest points, used as the town’s damage limit. Progress cannot defeat it. Victory requires 20 actual damage on Dagnir; the town loses at 50 damage.

## Sources and runtime corrections

The immutable DragnCards source is `src/data/pending/fire-in-the-night-import.json` (Q08.6/E08.6, 24 identities and 25 original faces). The original scans are the rules authority; all 25 faces were visually read in `output/ered-release/sources/fire-sheet-{1..5}.jpg`. The [official MEC68 insert](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec68_web_fire_in_the_night_rules.pdf) defines encounter side quests, the current quest, discarded excess progress, and their uncancelable when-revealed effects.

Runtime files correct the following source transcription errors while leaving the snapshot immutable:

- Dagnir and Burning Watchtower have printed threat X. Dagnir has Victory 5; the raw `quest: 5` field was a misclassification of that victory value.
- All eight side quests have Victory 10. Defend the Town, Draw Her Fire, and Rout the Goblins have 5 quest points; the other five have 10.
- Rout the Goblins gains 5 quest points for every Goblin enemy in play. The raw transcription omitted this entire clause.
- Powerful in Wrath refers to its actual name, and Swarm of Bats uses the printed singular name.
- Easy mode retains all three copies of The Dragon’s Thrall. Its original scan has no gold removal ring, and the [original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/Fire-in-the-Night) independently lists Normal 3 / Easy 3. The raw recipe incorrectly has one. Runtime totals are 47 normal and 35 easy physical cards, including the main quest, Dagnir, and eight side quests.

## Rule handling

The side deck stores physical facedown Unit instances, retaining their IDs when planning reveals them. Public projection exposes its count. At the end of planning a side quest enters staging before Dagnir attacks the town without a shadow. The first player can defend; actual excess damage reaches the town. The Dragon’s Fury instead redirects only undefended damage. Powerful in Wrath’s shadow redirects actual excess damage from the resolving attack.

Dagnir remains in staging, is immune to player card effects, and becomes engaged with every player once three side quests are in the victory display. All side quests, including player side quests, count toward X. Actual non-quest damage is limited cumulatively each round; Face the Dragon’s quest damage bypasses that limit. Face the Dragon’s healing, The Dragon’s Thrall’s shadow, and Gathering Gloom’s shadow trigger only after the attack actually destroys a character.

All eight side quests have their printed restrictions and optional/forced rewards. Rout searches sequentially for different physical Goblin cards; the wording does not require different titles. Fortify the Defense overrides final defense against Dagnir. Draw Her Fire protects Dagnir’s shadows from player effects and cancellation. Town Gate counts resources only in staging, Douse the Flames damages the town at quest end, and Defend the Town both adds its current-quest reveal and damages the town for staging enemies at encounter end.

The reused Grey Mountain Goblins, Dark Woods, and Gathering Gloom cards run explicitly through the Fire hooks, including Stray Goblin’s engagement and physical shadow movement, Goblin Troop’s attachment restriction and same-player bonuses, the per-round Forest progress cap, and Accursed Forest’s cancellation restriction.

## Verification

`tests/fire-night-scenario.test.ts` exercises native setup, planning attacks, damage limits, multiplayer ownership, dynamic side quest points, rewards, town damage, victory/loss, shared encounter sets, and save rejection. `scripts/browser-fire-night.mjs` exercises actual UI actions at 1280, 390, and 320 pixels and records the production main-module response body plus original artwork hashes and decode dimensions.
