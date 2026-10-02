# Collector's Edition main decks

The two 50-card preconstructed main lists included in the **Two-Player Limited
Edition Starter / Collector's Edition** are registered for automated play. These
are the bundled Leadership/Spirit and Lore/Tactics decks, with their exact printed
heroes and recipes in `officialStarterDecks`. The client identifies their bundled
origin, validates the entire recipe, and routes **Choose for play** through the
ordinary deck review and adventure setup. This does not assert support for the
entire original expansion pool of every reprinted card.

Product provenance is retained in `products.json` and the recipe `source_url`:
[FFG Collector's Edition announcement](https://www.fantasyflightgames.com/en/news/2018/6/21/there-and-back-again-1/),
[original product page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/lord-rings-living-card-game-limited-collectors-edition/),
and the pinned [OCTGN Limited Starter definitions](https://github.com/GeckoTH/Lord-of-the-Rings/blob/802f09c407e8b418c6fa59fd003bddfdc671e968/o8g/Sets/Two-Player%20Limited%20Edition%20Starter/set.xml).
OCTGN/DragnCards provide the imported transcription and source images; they are
not described as official publisher APIs. `collector-player-cards.json` retains
the canonical designs, printed text, images, and original pack metadata.

`collector-player-cards.ts` completes 23 additional designs. PLAY-from-hand
responses (Nori, Fili/Kili, Galadriel and Andrath Guardsman) inspect both actual
PLAY and hand origin. PUT-into-play from Elf-stone and Galadriel does not create
PLAY reactions. Searches and top-five permutations retain physical card identity,
including a used Heavy Stroke among otherwise identical hidden copies.

Azain offers one optional response per physical attacking ally per killing
attack. Any living player may pay the Tactics resource; multiple eligible payers
do not create multiple uses. Ioreth can be used by another fellowship with its own
Lore resource and is exposed in the companion area. Blue Mountain Trader moves
control without changing physical ownership or creating an entry event, and its
once-per-round use follows the physical ally across controllers.

The Long Defeat attaches to the actual current encounter quest, with one copy per
quest. Defeat snapshots the attachment, discards it to its owner, and suspends stage
advance until the optional response, each player's draw/heal choice, and nested
effects finish. Healing is allocated up to five among that player's characters,
then applied as one effect per character. Bypassing a quest does not count as
quest defeat. This preserves healing before Road to Rivendell's final-stage ban.

Desperate Defense uses the actual Sentinel defender declaration and one physical
event copy. Its defense bonus belongs to this attack's combat context. The damage
ledger includes damage actually assigned through Dori or Song replacements, and
excludes cancelled damage. Thus Dori taking the attack's damage prevents the
original defender from readying; Frodo cancelling all damage permits readying.
Counter-Spell cancellation pays and discards the event without granting the
defense bonus or its readying response.
Dúnedain Lookout cancels only an enemy's eligible When Revealed effect while the
physical enemy still enters play, and respects encounter cancellation bans.

End-round Sellsword group payment resolves before new-round resources. Galadriel
and Elrond discard at the actual end of the round. Mablung's engagement bonus lasts
through phase changes and clears at round end; the client and coach display the
current engagement cost. Elf-stone uses the explored location attachment snapshot
and the current first player's hand, including with multiple active locations.

Validation:

- `tests/collector-player-cards.test.ts`: 38 focused cases covering all 23 designs,
  both exact recipes, physical identity, multiplayer cost/control/ownership,
  real reveal/defense actions, paid event cancellation, quest timing, and
  save/reload during decisions.
- `scripts/browser-collector.mjs`: both real retail 50-card starts; physical quest
  target/attachment save; Long Defeat healing allocation and delayed advancement;
  cross-seat Ioreth action/payment; actual Desperate Defense/Dori attack; no browser
  errors and no overflow at 1280, 390 and 320 pixels.
- Browser captures: `output/collector/quest-target-*.png`,
  `healing-allocation-*.png`, `ioreth-other-player-payment-*.png`,
  `desperate-defense-*.png`, and both `limited-*-setup-1280.png`.

The evidence is local development validation. No deployment is implied.
