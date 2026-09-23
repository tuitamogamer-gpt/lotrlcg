# Playable scope

## Included

- Solo **normal games** for all three Core Set quests. Choose any quest independently; no campaign effects or rewards apply.
- **Passage Through Mirkwood**: the original 36-card encounter deck, correct setup, quest thresholds 8 and 2, random final stage, Beorn’s Path and Don’t Leave the Path victory conditions.
- **Journey Along the Anduin**: the 47-card encounter deck, setup reveal and Hill Troll, the stage-one Troll gate, two reveals per quest phase on the river, skipped automatic engagement checks on stage two, and the final two-card ambush followed by eliminating all enemies in play.
- **Escape from Dol Guldur**: the 41-card encounter deck, a captured hero, three guarded/restricted objectives, prisoner rescue, the Nazgûl, one played ally per round during stages one/two, facedown player-card Orc Guards, and the final progress plus Nazgûl victory condition. Gandalf’s Map, Dungeon Torch, and Shadow Key have their printed drawbacks.
- The Revised Core Set’s **Mirkwood Paths campaign**, linking those three quests in order. Mendor, Mendor’s Support, Valor, Appointed by Fate, Ungoliant’s Swarm, Lingering Venom, and Scarred are scripted. A persistent campaign log tracks chapters, scores, boons, burdens, permanent hero attachments, fallen heroes, hero-replacement threat penalties, the recorded Dol Guldur prisoner, and Mendor’s survival.
- Between chapters, heroes heal, decks reset, and earned cards carry forward. Players may replace fallen heroes and voluntarily replace one other hero, paying the permanent +1 starting-threat penalty per replacement. The recorded prisoner stays in the fellowship. Mendor’s Support can be included or omitted. A surviving Mendor unlocks the initial Support boon in a subsequent Core Set campaign. A failed quest can be retried from its previous campaign checkpoint.
- All four **original Core Set learning decks** with exact printed quantities: Leadership (Aragorn, Théodred, Glóin), Tactics (Gimli, Legolas, Thalin), Spirit (Éowyn, Eleanor, Dúnhere), and Lore (Denethor, Glorfindel, Beravor). Each has 30 player cards, including one Gandalf, plus three heroes. Deck titles in the interface are original presentation names. Campaign hero changes are independent of the selected starter player-card deck.
- Script handlers for all **73 Core Set player definitions**, all **45 Core Set encounter definitions**, and the **7 campaign support definitions**. These cover passive stats, actions, restrictions, payments, uniqueness, restricted attachments, entrance effects, hero powers, healing, scouting, cancellation, response prompts, X-cost search/resurrection, attack prevention, traps, multi-defender combat, temporary allies, surge, doomed, extra/nested shadow attacks, treacheries, objective guards, and victory points.
- Rules state: opening hand/mulligan, automatic resources and draw, player-directed resource payment, commitment, staging resolution, active-location progress, engagement checks, enemy/player attacks, refresh, death and threat elimination, score, deterministic shuffling, autosave, import/export, and local undo.
- Normal games and campaigns have **separate browser saves**. The selected mode persists across reload. Version-one Mirkwood saves are migrated. Imported games restore their scenario, mode, campaign log, and pending choice.
- Library: searchable 1,315-card snapshot with explicit scripted indicators and a manual live RingsDB refresh. Only the supported Core Set cards are playable.

## Timing boundaries

This is a playable implementation, not a certified complete rules engine for the entire game.

- Resources and standard refresh framework steps are automated. The visible phases provide action windows, including a post-staging window before quest resolution and the refresh action window. The engine does not expose every intermediate action window inside an attack or between individual framework steps. For example, Swift Strike and Hasty Stroke have prompts, but arbitrary events are not available at every internal attack step.
- Optional responses use a fixed order (for example Théodred before Aragorn). Some beneficial effects, such as Legolas’s progress, Mendor’s ready/draw, and prisoner rescue, are resolved automatically. There is no general response-order editor. Valor, targeted responses, and cancellation use explicit prompts.
- Ranged, Sentinel, and Wandering Took’s transfer ability have no other player to target in solo play. No multiplayer behavior is implemented.
- Brok, Valiant Sacrifice, Strength of Will, Swift Strike, and cancellation effects are available through engine-triggered prompts, not unrestricted hand actions.
- X-cost cards and multi-pool payments require explicit payment selection. Imported saves preserve pending choices; undo intentionally reveals information in this local solo setting.
- Original introductory single-sphere decks are preserved even for the harder quests. These are 30-card learning decks, not optimized constructed decks; Dol Guldur is particularly difficult solo.

## Not included

Multiplayer, expert campaign rules, nightmare/easy modes, expansion quests (including The Dark of Mirkwood), other campaigns, deck import from RingsDB, an unrestricted deckbuilder, or expansion-card scripting. Browsable cards are not automatically playable.

## Validation

Focused engine tests cover the quest gates, encounter/shadow mechanics, objectives, campaign rewards, permanent effects, captive characters, hero changes, retries, saves, and victory. Deterministic complete-game simulations cover all four decks across every quest and both modes (300 runs). The simple legal-action policy checks state integrity, serializability, and termination; these runs do not establish balance, strong strategy, or exhaustive rules compliance.

Browser checks exercise actual controls for all four starters, each normal quest, and the three-chapter campaign. Controlled checkpoints are used for victory/reward and rescue cases; these are not claims of three naturally won games. Checks cover mode selection, independent saves/reload, hero replacement, chapter transitions, prisoner choice, objective claims, Mendor rescue, the final reward, card inspection, payments, and 320/390-pixel mobile layouts. See `progress.md` for release evidence.
