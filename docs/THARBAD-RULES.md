# Trouble in Tharbad — original and easy

`trouble-in-tharbad` adds sixteen encounter designs and two quests, reusing four Misty Mountain Orc designs. Exact Q04.6/E04.6 recipes contain 40/32 physical encounters. Setting aside Bellach and the Crossing, putting Nalir under the first player's control and making The Empty Mug active leaves 36/28 cards before staging one Spy from Mordor per player. Difficulty is 4; one to four players and official easy starting resources are supported.

## Sources

- Pinned catalog and Q04.6/E04.6 recipes in `public/catalog.json` and `public/scenarios.json`; exact imported rows are retained in `src/data/tharbad-*.json`.
- [Official FFG rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/bf/30/bf3025c5-5f81-4e01-8d12-cfd5bc19eb5d/trouble-in-tharbad-rulesheet.pdf). The reduced threat-elimination level persists for the rest of the game. Ordinary characters can defend attacks against Nalir; undefended damage must be assigned to Nalir.
- Printed cards, with all twenty front/back images cached locally. Streets of Tharbad prohibits staging progress; it does not have blanket immunity.
- [Scenario guide](https://visionofthepalantir.com/2018/06/05/trouble-in-tharbad/) and [Hall of Beorn product](https://hallofbeorn.com/LotR/Products/Trouble-in-Tharbad?View=Browse), checked against the original wording.

## Implemented rules

| Card / stage | Behavior |
| --- | --- |
| Double Dealings | Mulligans finish before physical setup. Quest progress after active-location buffers instead reduces every living player's threat. Everyone must reach zero before advancement. Time 4 expiration lowers the shared elimination level by ten, immediately checks players against the new limit and resets surviving games. |
| Escape from Tharbad | Adds set-aside Bellach and the Crossing, shuffles discards, and discards until one Orc per initial player has entered staging. Time 3 expiration offers +3 threat to every player or Bellach attacking Nalir, when that attack is possible. Character departures raise their controller's threat by two. Quest progress goes to the Crossing. |
| Nalir | Follows first player with his physical identity, damage and attachments intact. Raises his controller's threat by initial player count at the beginning of refresh, before readying. Any departure loses the game, including elimination of his controller. Immediate attacks preserve Nalir as the mandatory undefended damage target and permit ordinary/Sentinel defenders. |
| The Empty Mug | Prevents every threat reduction while in play. In victory it makes the current quest remove the physical player card that caused an actual reduction. The shared reduction helper preserves original ownership, pending event resolution, borrowed permanents, attachments, discard costs and victory sources. Zero reductions and quest effects do not remove cards. Removal is not destruction. |
| Bellach / Crossing | Bellach scales threat by player count, boosts Orc/Creature threat and lowers their engagement costs, and shuffles back only on destruction. The Crossing is immune to player effects, cannot become active, has 10 + 2 per player quest points and wins immediately upon exploration. |
| Spy / Marauder | Spy attacks remove Time before defender selection. Each actual counter removed gives every engaged Marauder two physical shadows. Shadows gained during the current attack are inserted and resolved, including chains and Silver Lamp visibility. Prevented attacks do not trigger Spy. |
| Ruins / Streets | Staging Ruins stack City threat bonuses; active Ruins deal an additional shadow at combat beginning. Staging Streets block all progress; active Streets lower engagement costs. |
| Rooftops / Alley / Inn | Rooftops returns all engaged enemies and disables automatic engagement while active, retaining optional engagement. Alley pays threat per enemy for every player before adding Time on entry. Inn searches deck or discard for a Spy, adds it without revealing and shuffles. |
| Hideout | Active Hideout blocks all current-quest Time loss, including shared Orc choices. Its quest-start progress works in staging or while active. |
| Constant Tail / Cornered | Tail returns all engaged enemies and offers Time removal or +2 threat to current staging Spies until phase end. Cornered offers Time removal or -20 engagement/+1 attack to current enemies until round end. Future enemies do not inherit these effects. |
| Conspicuous Lot / Get That Dwarf! | Lot counts controlled objective allies and checks its conditional Surge after threat increases. Dwarf chooses the highest current staging attack, with an explicit first-player tie, then completes engagement effects before its attack against Nalir. With no staging enemies it surges. Cancellation suppresses both When Revealed text and conditional Surge. |
| Shadows | Low-threat attack bonuses use the defending player. Inn raises threat by actual attack damage, once per physical shadow. Dwarf's separate undefended damage hits Nalir. Marauder Time loss can cause ordered deadlines and additional shadow chains. |

The threat dial, scenario bar, quest goals, public state and event review display the actual elimination level. Saves validate scenario state, set-aside physical identities, counters, round modifiers and pending Nalir attacks. The additive account-choice migration preserves existing ownership policies and was tested locally; no hosted Supabase migration was applied.

## Verification

- `tests/tharbad.test.ts`: 63 semantic checks cover all normal/easy 1–4-player setups, transitions, elimination, attack targeting, timing, cancellation, physical sources, borrowed ownership and malformed saves.
- Full non-simulation engine regression: 2,202 passed. The 21 ordinary hot-seat checks also pass. Focused complete-game simulations and hidden/decisions/guided parity pass; all forty Core learning-deck stress games lost. Dedicated semantic/client fixtures verify reachable victory.
- `scripts/browser-tharbad.mjs` passes 54 checkpoints and exercises actual menu, opening hand, threat limit, advancement, saved Time/defense choices, Nalir protection/loss, Gandalf removal, travel/search, Hideout, Crossing victory and four-player easy setup at 1280/390/320 pixels. All twenty local faces decode, with no page/console errors or horizontal overflow. The desktop escape and 320px defense screenshots were visually inspected.

Nightmare and campaign variants remain reference-only.
