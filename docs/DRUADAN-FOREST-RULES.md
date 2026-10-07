# The Drúadan Forest — original and easy

The native scenario uses the original Drúadan Forest and Brooding Forest encounter sets, three printed quest stages (11 / 17 / 14), and canonical recipes Q03.5 and E03.5. Nightmare remains outside this implementation.

## Sources and normalization

- [FFG rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/f2/0c/f20ccb7d-393b-47ea-88a6-195ab1ee08a4/mec19-the-druadan-forest-rulesheet.pdf): encounter sets and group Prowl.
- [FFG easy mode list](https://www.fantasyflightgames.com/ffg_content/lotr-lcg/support/easy-mode/LOTR_Easy_Mode.pdf): remove two Drummers, two Hunters, two Glades of Cleansing, Ancestral Clearing, two Overgrown Trails and two Lost Companions.
- [Published card/recipe catalog](https://dragncards.com/plugin/1): original UUID identities, quantities, text and recipe sections; scenario JSON preserves provenance.
- Printed scans checked directly: [The Pursuit 1B](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/71079813-3afe-41b7-8746-92dcc1f91084.B.jpg), [An Untimely End 2B](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/346fda89-94df-410a-8027-41eacbf27238.B.jpg), [The Passage Out 3B](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/f6578eb7-1b94-458b-aba1-82b406507a4d.B.jpg).

Upstream text omitted Siege at stage 3 and converted the boss's circumflex into an attack icon in rules references. The scenario definitions restore both. Leaves on Tree's encounter set had a trailing period; normalization ensures both copies join the deck.

## Behavior

- The boss is publicly set aside and enters staging once at stage 3. Setup reveals one card per player. Tests preserve the complete original/easy recipe across one through four players.
- Prowl discards one shared group resource total from any heroes. It is distinct from spending, resolves before When Revealed cancellation and discards all available resources when the group cannot meet the value.
- Stars in Sky resolves Prowl, then every questing hero pays or leaves the quest; allies remain. Men in the Dark offers each hero a payment/damage decision, gaining surge only when no hero actually takes damage, after replacements such as Frodo. Leaves on Tree counts every attachment a player controls across hosts, then offers full payment or full discard.
- Every Glade adds Archery to every Wose. Glade threat uses the highest cumulative Wose Archery. Every Drummer increases staging Wose threat. Stage 2 Archery targets allies while any surviving ally can receive damage, across all players.
- Clearing increases all player play costs and requires exhausting a hero to travel. Garden requires one resource from each player to travel, blocks card-effect hero resource gains, and preserves normal resource collection. Tests cover Steward, Glóin, Horn, Miruvor and Errand-rider.
- Allies cannot defend against the boss. All printed shadows are implemented, including defending-character resource/attachment loss, resource-dependent attack bonuses, Wose bonuses, and any-player payment to prevent returning the attacker to staging after its attack.
- Stage 3 uses defense when questing (Siege) and current willpower when attacking, against enemy defense. Attack damage becomes accumulating enemy progress. At the hit-point threshold the enemy enters the victory display and transfers that progress directly to the quest, bypassing the active location. Excess attack strength does not become extra quest progress. Physical attachments/shadows leave; this does not destroy the enemy or trigger damage/kill responses. The boss in victory grants global +1 willpower/+1 defense. Victory requires 14 quest progress and the boss in the display.

## Persistence and validation

Prowl, payment, treachery and shadow continuations are serialized. Save validation checks the public set-aside identity and actual-damage tracker. Multiplayer choices/resources survive reload.

Run semantic checks with `node --import tsx --test tests/druadan-forest.test.ts` and browser proof with `GAME_URL=http://127.0.0.1:5178 node --import tsx scripts/browser-druadan-forest.mjs`.

The browser suite exercises saved multiplayer Prowl, willpower attacks, enemy progress, reload and victory at 1280/390/320 pixels, checking client errors, overflow and dialog clipping. Its peaceful combat flow passes from the first fellowship to a second fellowship's Ranged attack, preserving the once-per-enemy-per-player limit. Screenshots go to `output/druadan-forest/`.
