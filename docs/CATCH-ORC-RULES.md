# To Catch an Orc — original and easy

`to-catch-an-orc` implements all three quest stages and fourteen encounter designs from To Catch an Orc, Misty Mountain Orcs and Broken Lands. The pinned original/easy recipes contain 37 / 31 physical encounters, including Mugash and three guards. After setting those four aside, the encounter deck contains 33 / 27 cards; each player then removes one chosen Mountain for staging. Setup supports one to four players and easy mode's extra starting resource.

## Sources and timing

- Full imported reference rows and recipes are retained in `src/data/catch-orc-*.json`, from the pinned DragnCards snapshot in `public/catalog.json` and `public/scenarios.json`. Their provenance and hashes remain in `public/data-metadata.json`.
- [FFG Voice of Isengard rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/cd/e6/cde67433-f555-4fbe-b45d-28dca420e7b3/the-voice-of-isengard-rulesheet.pdf), pages 2 and 5–6: Time, difficulty 4, out-of-play decks, player-backed encounter enemies and Searches X.
- Original card faces confirm all front/back text. All fourteen encounter faces and six quest faces are cached locally, with their original URLs preserved.
- [Archived designer ruling on Searching for Mugash](https://ffg-forum-archive.entropicdreams.com/topic/188736-specific-situation-ride-them-down-searching-for-mugash-search-keyword/): the response occurs before progress is physically placed, needs positive progress beyond the active location, and cannot be triggered while Ride Them Down replaces that progress. Mugash discovered by the ensuing exploration cannot enable advancement in the earlier response window.
- [Scenario guide and linked rulings](https://visionofthepalantir.com/2018/05/15/to-catch-an-orc/) cross-check setup after opening hands and mulligans, repeated Mountain choices, searches and capture timing.

## Implemented rules

| Cards / stages | Behavior |
| --- | --- |
| Orders from Orthanc | Every player keeps or mulligans using the full deck first. Then twenty actual cards per deck are set aside; Mugash and one guard per other player are randomly assigned, one per hidden deck, and shuffled in. Unused guards remain set aside. Each player searches for a Mountain; repeated titles are legal. Setup advances to stage two and Time 2. |
| Searching for Mugash | Positive successful-quest progress beyond active locations offers the optional response: cancel that quest progress and add one time, or advance if Mugash is already in play. Active locations still receive progress. Time can exceed two. A timeout shuffles the encounter discard into the deck, reveals two per player, then restores two counters. |
| The Wizard's Prize | Time 3 and fifteen quest points. Quest progress is prohibited until Mugash is attached to a hero, while active locations still buffer progress normally. Timeout returns the captive or engaged Mugash to staging, reveals players minus one encounter cards, and restores three counters. |
| Mugash | Defeat captures the same physical enemy on a hero chosen by the first player. The hero exhausts and cannot ready. If that hero leaves play, including through elimination, the game is lost. Mugash's printed attachment prohibition remains active while he is an enemy. |
| Mugash's Guard | Continuously engages the captive's controller, including moving from another player. An actual combat destruction releases Mugash; noncombat damage does not. Killing the captor still loses the game immediately. Defeated guards award their printed three victory points. |
| Methedras Orc | Each actual attack shuffles one random physical hand card into the defending player's out-of-play deck. Its shadow removes Time only when the current attack actually destroys a character. |
| Methedras | While active, adds one threat to each staging location. Exploration makes every player Search 3. Each revealed enemy enters staging; the searching player chooses one player card for hand and discards the rest to their owners. Recovery is not drawing. |
| Orc Cave | Exploration makes only the first player Search 5. Its travel cost discards one encounter card per player, adding discarded Orc enemies without revealing them. An empty deck is not reshuffled by this discard. |
| Mugash's Lair | Each in-play copy reveals one top out-of-play card per player at encounter start, adding enemies and discarding all other cards without recovery. Its shadow discards a controlled attachment. |
| Orc Territory | Each player chooses a location from the encounter deck or discard; the choices preserve both source zones. Then, if staging threat is strictly below committed willpower, each engaged Orc attacks immediately. |
| Orc Skirmisher / Orc Hunter / Orc Hound | Skirmisher's engaged player chooses three damage to a controlled character or one Time loss. Hunter offers another reveal or one Time loss. Hound has Surge and forces its engaged player to exhaust a character. Their shadows provide +1 attack / an extra attack after the current one / none. |
| Orc Hunting Party | Deals a shadow to every Orc in play, lowers their engagement by fifteen until round end, and gains Surge if staging contains no Orc. Conditional Surge is cancelled with the When Revealed effect. Shadows added in staging are discarded at combat end. |
| Prowling Wolf / Broken Lands / Take Cover! | Wolf's engaged attack counts staging locations; its shadow exhausts a defending player's character. Broken Lands blocks progress on every staging location, including itself; its shadow adds attack per staging location. Take Cover has Surge and offers damage to all exhausted characters or one Time loss. |

Hidden piles expose only counts in the interface, public state and event history. Revealed Search choices and pending capture retain physical identity and survive reload. Borrows retain ownership when recovered or discarded. Eliminated players' hidden encounter cards remain set aside. Time expires after the refresh action window; a captor whose captive escapes then remains exhausted, because the refresh ready step has already passed.

## Verification and scope

`tests/catch-orc.test.ts` contains 55 semantic tests covering every printed clause, normal/easy setup for one to four players, full-deck mulligans, positive overflow and Ride Them Down, hidden identity, capture/control/loss, shadow timing, conditional Surge, resource/refresh timing and malformed saves. Complete-game simulations compare ordinary and guided/hidden/decisions outcomes. The separate browser suite passes 54 responsive checkpoints exercising real controls, reloads and all twenty local faces at 1280/390/320px, including a final captured-Mugash victory. It is included in `npm run test:ring-maker-quests` and GitHub CI.

The additive account-choice migration is tested locally; hosted Supabase changes are not part of this release. Only original/easy To Catch an Orc is enabled. Into Fangorn, the six Ring-maker Adventure Pack quests, Nightmare and scenario campaign variants remain pending.
