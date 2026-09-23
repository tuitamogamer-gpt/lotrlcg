# Playable scope

## Included

- Solo, normal-mode **Passage Through Mirkwood**: its original 36-card encounter deck, correct setup, quest thresholds 8 and 2, random final stage, Beorn’s Path and Don’t Leave the Path victory conditions.
- All four **original Core Set learning decks** with exact printed quantities: Leadership (Aragorn, Théodred, Glóin), Tactics (Gimli, Legolas, Thalin), Spirit (Éowyn, Eleanor, Dúnhere), and Lore (Denethor, Glorfindel, Beravor). Each has 30 player cards, including one Gandalf, plus its three heroes. Deck titles in the interface are original presentation names.
- Script handlers for all 73 Core Set player definitions: passive stats, actions, restrictions, costs, resource matching, uniqueness, restricted attachments, ally entrance effects, hero powers, healing, scouting, shadow/when-revealed cancellation, conditional response prompts, X-cost search and resurrection, attack prevention, traps, multi-defender combat, and temporary allies.
- All 19 encounter definitions in the scenario: when-revealed choices, travel costs/rewards, shadows, webs, engagement triggers, victory points, and escalating Ufthak attacks.
- Rules state: opening hand/mulligan, automatic resources and draw, player-directed resource payment, commitment, staging resolution, active-location progress, engagement checks, enemy/player attacks, refresh, death and threat elimination, score, deterministic shuffling, autosave, import/export, and local undo.
- Library: searchable 1,315-card snapshot with explicit scripted indicators and a manual live RingsDB refresh. Only the supported Core Set cards are playable.

## Timing boundaries

This is a playable first implementation, not a certified complete rules engine for the entire game.

- Resources and standard refresh framework steps are automated. The visible phases provide action windows, including a post-staging window before quest resolution and the refresh action window. The engine does not expose every intermediate action window inside an attack or between individual framework steps. For example, it offers Swift Strike after defender declaration and Hasty Stroke for a shadow, but does not allow arbitrary events at every internal attack step.
- Optional responses use a fixed order (for example Théodred before Aragorn). Some beneficial optional effects, such as Thalin’s passive damage and Legolas’s progress, are resolved automatically; the interface does not provide a general response-order editor. Targeted and cancellation responses use explicit prompts.
- Ranged, Sentinel, and Wandering Took’s transfer ability have no other player to target in solo play. No multiplayer behavior is advertised or implemented.
- Brok, Valiant Sacrifice, Strength of Will, Swift Strike, and cancellation effects are available through their engine-triggered prompts, not as unrestricted hand actions.
- X-cost cards and multi-pool payments require explicit payment selection. Imported saves preserve pending choices; undo intentionally reveals information in this local solo setting.

## Not included

Other scenarios (Journey Along the Anduin and Escape from Dol Guldur), multiplayer, campaign/nightmare/easy modes, deck import from RingsDB, an unrestricted deckbuilder, and scripts for expansion cards. Browsable cards are not automatically playable. No hosting or deployment has been performed.

## Validation

The test suite covers targeted rule interactions and runs 25 deterministic complete games per starter deck (100 total) with a deliberately simple legal-action policy. These runs check state integrity and termination; they do not establish card balance, competitive strategy, or exhaustive rules compliance. Browser tests play each starter through its first round, restore saves, inspect cards, and exercise mobile navigation and the catalog. Screenshots are reviewed manually. See `progress.md` for the final check results.
