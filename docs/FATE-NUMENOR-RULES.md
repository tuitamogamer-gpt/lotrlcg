# The Fate of Númenor

Original The Grey Havens scenario, with standard and easy recipes for one through four players. The original scenario is available as `the-fate-of-numenor`; the recipe identities are `Q06.2` and `E06.2`. Nightmare and revised campaign content remain separate catalog entries.

Primary rules source: the original [The Grey Havens rules PDF](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf), particularly the Uncharted rules on pages 7–8. Printed cards and recipes come from the cached DragnCards catalog, with original card scans cached locally. The source bundle is `src/data/pending/the-fate-of-numenor-import.json`.

## Setup and Uncharted locations

The encounter deck contains 24 cards in standard mode and 17 in easy mode. The ten double-sided locations form a separate, shuffled Uncharted deck. Shrine to Morgoth is set aside, and Calphon enters under the first player's control. The staging area receives two Lost Islands for one or two players, and three for three or four players. Easy mode also uses the engine's usual additional starting resources.

Each unknown location has the same public Lost Island definition: 2 threat, no quest points, and its printed Uncharted rules. Its real side is stored in the private scenario state, so uninspected backs never appear on table cards, in card inspection, or in `render_game_to_text`. Lost Islands can receive progress but cannot be explored by progress; they cannot have player attachments. The Action removes four progress to look at the reverse without flipping or resolving that side's abilities. The look opens a player-scoped decision with the actual card face. Knowledge is retained only for the player who looked.

When an island becomes active, including through a player effect, it turns over and loses all progress. On stage one this also adds another Lost Island to staging. Its revealed side subsequently follows normal location rules. A double-sided location that would be discarded is shuffled into the Uncharted deck with Lost Island faceup. It never becomes a normal encounter deck card. Stage two replaces recycling after exploration with the victory display.

Ruins of Ages Past and stage two remove progress and shuffle the unknown islands. The implementation assigns fresh public identities and erases previous peek associations, so players cannot track the shrine through card IDs or previously inspected positions.

## Quest and location effects

Explore the Island receives progress exclusively from its own Forced effect: each explored location contributes its printed quest points. Ordinary quest success and player progress effects can explore the active location but cannot place surplus progress on stage one. Player side quests remain available under their usual rules. At 20 progress the quest defeats, attachment responses resolve, and stage two adds two more islands plus the hidden shrine before shuffling all unknown islands.

A Fateful Discovery is won when Shrine to Morgoth is explored and enters the victory display. Other explored Uncharted locations enter victory rather than the Uncharted deck. Calphon leaving play ends the game, and his control follows the first player throughout the scenario.

All location effects are implemented:

- Lush Jungle offers returning to staging or exhausting every ready hero. In staging it reduces every character's attack by one and removes ranged. The exhaust option is available only when its instruction can be fulfilled.
- Forbidden Coast offers a separate optional draw to every player, followed by a mandatory choice of a hand card to put on the bottom of that player's deck.
- Flooded Ruins contributes its threat while active.
- Drowned Graves discards the top number-of-players-plus-two encounter cards, then each player selects an available Undead copy discarded by that effect to add to staging.
- Cursed Temple prevents characters with less than two current willpower from readying during refresh.
- Shrine to Morgoth exhausts cheap allies, then every player chooses an Undead enemy from the encounter deck or discard pile to engage. The encounter deck is shuffled afterward. While active it prevents all player-deck searches and all draws, including the resource phase draw.
- Steep Plateau offers its optional look after exploration.

## Encounter and shadow effects

Servant of the Deceiver privately shows its controller's top deck card; a card of printed cost two or less moves to the bottom and grants the enemy two attack for the round. Soulless Cadaver moves every low-cost hand card to the bottom in an order chosen by its controller, and prevents searching only that player's deck. Throngs of Unfaithful has surge and returns to the encounter top if its destruction discards a low-cost bottom deck card.

Drowned Dead and its shadow replace an ally's combat destruction destination with the bottom of its physical owner's deck. Curse of the Downfallen damages non-objective allies of printed cost two or less and applies the same destruction replacement. Curse's cause travels with its serialized damage context through damage prevention and changed recipients, so unrelated damage does not inherit the replacement. These replacements happen before leave-play responses can recover a discarded copy, preserve physical ownership, and respect Sword-thain's conversion from ally to hero. Throngs of Unfaithful inspects an engaged player's deck only when it was actually engaged immediately before destruction.

Mysterious Fog offers group exhaustion or a stacking Lost Island threat bonus that ends with the phase. Lingering Malevolence discards the first player's bottom card, then every hand card of greater printed cost. Ruins of Ages Past retains Doomed 2 outside the cancellable When Revealed effect. Aimless Wandering lets the first player choose group quest removals until the required willpower is reached, then optionally applies Doomed 2 to inspect an unknown island.

Every printed shadow is implemented: bottom card discard and conditional attack bonus, conditional character exhaustion, conditional additional attack, and the Drowned Dead ally destruction replacement. Empty player decks and higher-cost discarded cards do not satisfy the conditional portions. Shared reveal/shadow cancellation machinery applies before these effects.

## Persistence and checks

Uncharted deck order, hidden backs, player-scoped knowledge, Calphon ownership, phase threat modifiers, in-flight choices and destruction replacements are serializable. Save validation rejects missing or extraneous hidden associations, invalid Uncharted codes and malformed player knowledge. Public output exposes counts and public IDs; inspected sides appear only for the current player who has legally looked.

Semantic checks: `node --import tsx --test tests/fate-numenor.test.ts`.

Browser checks: `node --import tsx scripts/browser-fate-numenor.mjs` with the development server at `http://127.0.0.1:5178`, or `GAME_URL` set to another server. The browser suite uses real controls and save/reload continuations at 1280, 390 and 320 pixel widths. It checks setup, private looking, travel and Forbidden Coast, Calphon swaps, victory, loss and four-player easy setup. Screenshots and the result are written to `output/fate-numenor/`.

The final verification passed all 38 semantic tests and all 24 browser checkpoints on the stable production preview, with no browser errors. The private-look dialog and narrow-screen opening state were also inspected visually.
