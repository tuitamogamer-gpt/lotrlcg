# Intruders in Chetwood

`intruders-in-chetwood` implements the first original Lost Realm scenario for 1–4 players, in standard and easy mode. It adds eighteen encounter definitions, one 30-point quest and twenty original local card faces. The source recipes are Q05.1/E05.1: 36/24 encounter-deck cards before each player removes a different setup location, plus the separately staged Orc War Party and Iârion.

## Sources and interpretation

- The pinned catalog and preparation snapshot retain the original identities, physical quantities, face URLs and artwork hashes. Runtime files are `src/data/chetwood-*.json`; the historical preparation snapshot is unchanged. See [source import notes](INTRUDERS-CHETWOOD-IMPORT.md).
- [Official Lost Realm rules](https://images-cdn.fantasyflightgames.com/filer_public/88/d6/88d6e80d-e75d-468f-8484-76c56b15e895/mec38_insert_web.pdf), pages 2–3, define encounter side quests, uncancelable When Revealed effects, first-player selection, location buffering, discarded excess progress, victory and Time. Page 5 says Iârion's loss clause cannot be modified by card effects.
- Stop the War Party has 30 quest points on its original reverse face; the runtime supplies this numeric value missing from the upstream transcription. Orc Rearguard retains its printed Victory 10.
- [A Long-extended Party's collected rulings](https://alongextendedparty.com/semi-official-errata-faq-1-10/), entry 3.379, quotes Caleb Grace confirming that Iârion should be unique. Runtime uniqueness follows that ruling while retaining the original scan.
- [Chetwood scenario guide](https://visionofthepalantir.com/2018/08/25/intruders-in-chetwood/) provides supporting context. Orc Rearguard's three-progress limit is tracked per physical quest and round: switching away and back, or removing progress, never resets the amount already placed. Progress placed earlier in the round counts if Rearguard subsequently enters play.

## Implemented behavior

| Mechanic | Behavior |
| --- | --- |
| Setup | Mulligans precede Iârion, the staged War Party and one distinct location choice per player. Setup locations are added without When Revealed, Surge or Doomed. The remaining encounter deck is shuffled once choices finish. |
| Main quest | Framework engagement checks are disabled; optional and card-directed engagement still work. End-of-refresh threat counts all staged enemies for every player. Victory needs 30 main-quest progress, controlled Iârion and no active War Party restriction anywhere in play. |
| Iârion | Willpower, attack and defense equal the number of quest cards in play, including both kinds of side quest. His optional ready follows encounter-side-quest revelation. Control follows the first-player token, including elimination of the previous controller. Ordinary departure loses immediately. |
| Encounter side quests | They remain physical staging cards, can be chosen by the first player, accept their own progress and attachments, and go to victory on defeat. Main-stage text remains active. Their When Revealed effects cannot be canceled. Dealt as shadows, they have no revelation effects. |
| Orc Rearguard | Active locations take progress before the quest's cap. Direct progress also respects the cap. When Rearguard is current at staging end, it reveals exactly one additional encounter card. Defeat removes its ongoing restriction. |
| Rescue Iârion | Revelation captures the existing ally facedown, preserving identity and damage. Time 4 decreases at refresh end even while another quest is current. Defeat returns him exhausted to the current first player; expiration discards him and loses. Simultaneous refresh effects are ordered by the first player. |
| Lost in the Wilderness | Each physical hand card retains its original owner beneath that quest. Defeat returns cards to their owners, including borrowed cards; eliminated players' cards are removed. Forced restoration precedes The Long Defeat's optional response. Public state exposes counts, not hidden identities. |
| Orc Ambush | Each copy increases every Orc's threat, attack and defense. Each player searches actual encounter deck/discard copies and puts an Orc directly into engagement, without its When Revealed. The deck is shuffled afterward. |
| Pressing Needs | Doomed 2 precedes its choice. Search reveals a real side quest, or another physical quest becomes current through the end of the current phase. This includes travel and combat, not only the quest phase. Switching and saved selections preserve remaining progress limits. |
| War Party and locations | A staged War Party protects staged enemies from damage and cannot take attachments. Borders returns one engaged enemy per copy at quest start. Forest requires an engagement as its travel cost. Homestead prevents threat reduction while staged and reveals a card before travel completes. Country and Hills use the current side quest and actual number of quest cards. |
| Treacheries | Assault compares committed willpower with staging threat and performs separate real attacks against the first player, with fresh shadows. If no attack occurs it shuffles itself and the discard pile back. Speed returns one engaged enemy per player, gaining Doomed 1 and Surge only if none returns. Weight reveals one card per quest in play. |
| Orcs and shadows | Angmar Orc discards an ally or reveals another card. Marauder returns after killing an ally. Captain discards from the attacked player's deck and attacks again if the card is an ally. Return and repeat effects have explicit ordering. All seven printed shadows retain their quest/ally counts, defending-player scope, attachment ownership and saved continuations. |

The interface shows current-side-quest progress, per-card Time, captive Iârion and facedown hand counts. Inspection preserves the original main quest and both printed faces. Saves include physical captured cards, ownership, selections, progress history and pending attack choices, rejecting duplicate hidden identities and invalid counters.

## Verification

- Sixty dedicated semantic tests cover real setup in both modes for every player count, victory/loss, uncancelable reveals, per-card Time, hidden ownership, selection outside the quest phase, travel costs, immediate attacks, all shadows and reload during decisions.
- The full engine regression passes 2,571 cases, including account migration/RLS checks and the existing side-quest, multiplayer, player-card and scenario rules.
- Forty complete Chetwood games using the four Core learning decks terminate with valid saves. All forty lose under the simple test policy; explicit semantic and browser fixtures separately verify victory. Hidden, decisions and guided review modes preserve complete-game outcomes. The unsupported campaign case is intentionally skipped.
- The Lost Realm fellowship sweep covers all 37 scenarios: 74 complete games plus 37 matching decisions-mode runs. It records actual Ranger Summons and Gather Information play, side-quest selection and defeat.
- `npm run test:lost-realm-quests` passes 63 browser checkpoints at 1280/390/320 pixels: real menu/setup, current quests, main-quest inspection, rescue, hidden-hand return, capped progress, Pressing Needs during travel, immediate attacks, ordered Captain effects, loss, victory and four-player standard/easy setup. It reloads pending choices, decodes all twenty local faces, and checks browser errors, horizontal overflow and dialog clipping. Desktop setup and mobile selection/attack-order screenshots were visually reviewed.

The additive `202610080006_chetwood_choices.sql` migration permits this scenario in account choices and passes local PostgreSQL checks. No hosted Supabase migration has been applied. Campaign and Nightmare variants remain reference-only. The Weather Hills and Deadmen's Dike are the next prepared scenario imports.
