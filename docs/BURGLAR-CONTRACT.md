# The Burglar’s Turn

Original Wrath and Ruin contract **22024**, both printed sides, uses a separate fourteen-card loot deck. The deck builder stores the chosen collection cards in `CustomDeck.loot`; these cards never count toward, or enter, the fifty-card player deck during setup. An unfinished selection survives draft and deck storage, but starting requires fourteen eligible, different Item or Artifact attachments and no attachments in the player deck.

## Play and physical cards

Setup creates a physical contract on side B and fourteen separately identified, owned, shuffled loot cards for each participating player. Actual travel attaches the next loot card faceup to the active location as a guarded objective. Its player attachment ability is inactive there, and its printed Guarded (X) keyword is ignored. Moving a location into the active slot without travelling does not draw loot.

Each contract adds one quest point per attachment on the active location. Multiple contracts stack, and the first player orders their simultaneous Forced effects. The Brown Lands’ own after-travel progress shares this ordering: resolving its progress first can explore it before loot is drawn; resolving loot first increases its quest points before that progress.

Active exploration offers each guarded attachment for free attachment to a legal target, addition to the resolving player’s hand, or decline. The ordinary attachment rules still enforce target restrictions, immunity, uniqueness and Restricted choices. Guarded (X) is also bypassed when the loot is attached to a character. Shared locations may contain loot belonging to different players; claiming changes control while retaining physical ownership. A normal Guarded attachment on that host can also be claimed through the contract. If all contract controllers decline it, its normal Guarded destination is retained, with the prior controller making that choice.

Loot on a location explored in staging, discarded or destroyed is discarded to its owner without a contract claim. It does not activate its ignored Guarded keyword. Immune locations do not trigger a loot draw. If the drawn unique loot is already in play, only that card is discarded, without replacement. Eliminating a player removes that player’s contract, unclaimed loot and owned guarded objectives while retaining the other players’ physical cards.

Wrath and Ruin retains its explored location in `pendingExplored` while simultaneous **When** effects are ordered. Contract collection therefore waits for its chosen position alongside capture and Seedy Tavern. Normal scenarios preserve the physical attachments in the contract’s pending claim zone before the explored host leaves. Both approaches keep one physical copy of each card and save the actual pending decision.

## Persistence and interface

`burglar-contract-types.ts` records physical contract/loot/claim units and metadata linking guarded objectives to their actual host attachments. `burglar-contract-support.ts` supplies collection legality, save validation, physical-zone aggregation and public projections. `burglar-contract.ts` owns setup, travel, exploration, optional destinations and departure handling. Shared hooks use the existing travel, attachment, exploration, actor and elimination paths.

Saved games retain the complete hidden order and physical identities. Public projections expose only remaining counts and already faceup objectives or claims; reversing the hidden loot order does not change public state. Invalid card definitions, repeated loot selections, duplicate physical IDs and missing guarded hosts are rejected. The game UI shows side B, remaining loot counts and public guarded cards. The collection selector supports inspecting, searching, adding and removing individual eligible designs, and persists unfinished selections through reload.

## Verification

Run the focused native suites with:

```sh
node --import tsx --test tests/burglar-contract.test.ts tests/wrath-ruin-integration.test.ts
```

The contract suite covers native setup for one through four players, the separate fifty-card draw deck, legality and saved drafts, actual travel, immunity, uniqueness conflicts, free attachment and hand destinations, printed target restrictions, Restricted overflow, ignored Guarded entry, ordinary Guarded coexistence and fallback in both normal and Wrath exploration, staging/discard departures, multiplayer ordering/ownership, both Brown Lands orders, non-travel movement, hidden-order privacy, malformed saves and elimination. Wrath integration additionally verifies capture-before-contract ordering and cross-zone physical identity rejection.

The browser suite `scripts/browser-wrath-ruin-players.mjs` exercises the actual builder with thirteen saved selections, reload, a fourteenth selection, legal deck save and game start. Native UI travel and quest resolution preserve the same physical card through saved hand and free-attachment decisions; a two-contract game checks shared-location ownership. Desktop and 320-pixel layouts are included. These are focused semantic and interface regressions, not exhaustive tests of every eligible attachment/scenario combination; attachment-specific rules continue to use their existing implementations and tests.

## Sources and interpretations

- Original printed faces and source hashes: [Wrath and Ruin source record](WRATH-RUIN-SOURCES.md), original files `public/cards/22024.jpg` and `public/cards/22024.B.jpg`.
- [Community compilation of designer correspondence](https://alongextendedparty.com/semi-official-errata-faq-1-10/), entries **3.331**, **3.332**, **3.334** and **3.366**: eligible collection cards, ignored Guarded through claim, unique-card conflicts and staging exploration. This is reproduced designer correspondence, not a publisher-issued FAQ.
- [Archived travel/immunity discussion](https://ffg-forum-archive.entropicdreams.com/topic/303966-the-burglars-turn-and-travelling-to-locations/), final March 9, 2020 reply: community-reported Caleb ruling that the contract does not trigger on travel to an immune location. The underlying designer email is not reproduced there.

“Fourteen different” is implemented as fourteen different printed titles, preventing alternate printings from supplying duplicates. “Each guarded attachment” includes ordinary Guarded attachments on the same active location, regardless of their physical owner. These are applications of the printed wording; the source review did not locate a separate explicit ruling for either interpretation. The player-deck attachment prohibition includes The One Ring. No separate unverified restriction on otherwise eligible loot collection cards is introduced.
