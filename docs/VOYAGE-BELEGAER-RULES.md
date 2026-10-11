# Voyage Across Belegaer — original scenario rules

The playable scenario uses the original **Q06.1** recipe and the original easy **E06.1** recipe from the immutable DragnCards snapshot in `src/data/pending/voyage-across-belegaer-import.json`. It implements all six quest cards, four Ship objectives, Heading, thirteen normal encounter definitions and four Corsair definitions. The three OCTGN rules-reference cards remain reference material, not automated cards. Campaign and Nightmare versions are not registered by this import.

Primary rules source: [Fantasy Flight Games, The Grey Havens rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf), pages 4–6. The downloaded text is `output/mec47_rules.txt`; card fronts and quest reverses are cached in `public/cards/` under their source OCTGN identifiers.

Travel-cost legality also follows the publisher's [Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf), pages 2 and 18: costs must be paid in full before travel. The Grey Havens rules, page 5, state that heading cannot shift off-course from its worst setting. Consequently ordinary travel to Rolling Seas is illegal at that heading; an effect that moves it into the active slot without paying Travel costs remains legal.

The source transcription of **Starlit Sea** says “Uncharted Ocean gains.” Its actual cached front (`b640a0b7-f23e-4859-96fb-b558274b90a8.jpg`) says **“Starlit Sea gains.”** The playable definition follows that physical front; the pending import retains the source transcription. The source OCTGN reference card also adds a zero-character Sailing restriction absent the publisher rulebook. The engine follows the publisher text: Calm Waters can supply additional looked cards and successes even when no characters commit.

## Physical setup and fleet

Standard setup has 27 cards in the remaining encounter deck, Rolling Seas and Scouting Ship in staging, and nine cards in the Corsair deck. Easy has 19 remaining encounter cards and seven Corsairs. These counts are derived from each recipe's physical sections; staged cards are not duplicated into the encounter deck. Every quest stage exists exactly once. Four stage-2 cards are randomized and Corsair Pursuit initially stays on the bottom.

Each player chooses a different unique Ship objective. One player must control the Dream-chaser. Solo controls the Dream-chaser plus one other chosen ship. If earlier multiplayer choices omit the Dream-chaser, the last fleet choice must take it. The unchosen ships remain physically set aside. Heading attaches to the Dream-chaser and starts on-course. Choices, ship ownership, unchosen physical ships and hidden quest order persist across save/reload.

Ships count as allies and characters, retain their printed immunity to player card effects and use their printed Sentinel/Ranged keywords. Ship objectives can attack and defend only against Ship enemies. Ship-enemy attacks can be defended only by ships; undefended ship attacks assign damage to a ship controlled by the attacked player.

| Ship | Implemented printed behavior |
| --- | --- |
| Dream-chaser | Can commit to any first player's Sailing test; counts as two committed characters. Its destruction loses the game. |
| Nárelenya | Reduces the controller's first ally play each round by one. Its destruction eliminates its controller. |
| Dawn Star | Raises starting threat by three; draws one additional card in the resource phase. Its destruction eliminates its controller. |
| Silver Wing | Lowers starting threat by three; each controlled hero has +1 attack, including a hero created by Sword-thain. Its destruction eliminates its controller. |

## Sailing and private decks

At the beginning of every quest phase, the main quest's Sailing keyword makes the first player test. Heading first shifts one setting off-course, clamped at the worst setting. The first player exhausts any number of eligible ready characters, including the Dream-chaser under another player's control. Actual exhaustion responses resolve, but player Actions wait until before or after the test.

The test looks at encounter cards rather than revealing them. It looks at one card per character, two for the Dream-chaser, and two additional cards per active Calm Waters. If the encounter deck is too small, its discard pile is shuffled into it before the look. Rough Waters in staging cancels one success per copy. The player chooses how many remaining success symbols to use, shifting one setting on-course per used success, then discards the looked cards. No Surge, Doomed, When Revealed, Thalin or other reveal effects run on looked cards.

The printed symbols are two on Calm Waters, and one each on Rough Waters, Thrown Off Course, Winds of Wrath, Starlit Sea and Rolling Seas. The other Voyage encounter cards have none. Symbol metadata records cached-face provenance in `src/data/grey-havens-sailing-icons.json`.

The Corsair deck and its own discard pile remain separate from the encounter deck. Non-Ship Corsairs leaving play go to the Corsair discard pile; an empty Corsair deck immediately shuffles that pile back. Future Corsairs and hidden quest stages are represented only by counts until a printed look or reveal permits their faces to be shown.

Boarding resolves only when a Ship enemy engages from staging. It reveals the printed number of Corsairs and puts them into play engaged with that player, one at a time. It does not repeat for a ship entering play already engaged or moving between players. Light Cruiser gives each Raider it boards one initial resource. Calphon's Divination adds Boarding 1 to each Ship enemy while off-course.

## Quest stages

| Quest | Implemented clauses |
| --- | --- |
| Departure from the Havens | Original fleet/deck setup; 8 progress; ships have +2 willpower on-course. |
| Into the Storm | Searches deck/discard for Waterspout; 2 progress; at quest-phase end, each off-course player distributes five damage among controlled characters. |
| Cursed Mists | Searches deck/discard for Fog Bank; 6 progress; off-course non-Ship allies have −2 willpower. |
| Calphon's Divination | Searches deck/discard for Scouting Ship; 4 progress; off-course Ship enemies gain Boarding 1. |
| The Star's Guidance | Searches deck/discard for Starlit Sea; 4 progress; off-course Ocean locations have +1 threat. |
| Corsair Pursuit | Searches for the highest printed-threat ship in deck/discard, two ships for 3–4 players; forbids progress while off-course. Wins immediately after pending effects when no Ship enemies remain, or when the stage reaches 10 progress. |

Defeating stages 1 or 2 on-course permits looking at exactly the top two hidden stages, selecting one and putting the other on the bottom. Off-course advances directly to the hidden top card. Defeat responses and quest attachments finish before the stage changes. Completed stages retain their printed Victory 3. Search ties and physical duplicate copies are explicit choices; searches shuffle the remaining encounter deck.

## Encounters, locations and shadows

| Card | Encounter/static/Travel | Shadow |
| --- | --- | --- |
| Scouting Ship | Boarding 1; cannot have attachments; −15 engagement cost off-course. | None. |
| Light Cruiser | Boarding 2; cannot have attachments; boarded Raiders start with one resource. | None. |
| Corsair Warship | Boarding 3; cannot have attachments; staging immunity to damage and Archery 4. | None. |
| Southron Sailor | Each Ship enemy engaged with its player contributes threat to staging. Copies do not multiply the same ship's contribution. | None. |
| Cunning Pirate | Discards one attachment controlled by the engaged player, wherever its host is; gains its printed-cost resources; +1 attack/defense per resource. Permanent attachments cannot be discarded. | None. |
| Vicious Marauder | Randomly discards an engaged player's hand card; gains its printed-cost resources. Before its attack, that player distributes damage equal to those resources. | None. |
| Umbar Captain | Its player's characters cannot attack Ship enemies, including attacks using Ranged. | None. |
| Boarding Party | Each player reveals one Corsair and puts it into play engaged with that player. | +1 attack; +2 if the attacked player controls an exhausted ship. |
| Calm Waters | Active: two additional looked cards per Sailing test. | +1 attack; +3 for a Ship enemy. |
| Rough Waters | Staging: cancels the first Sailing success per copy. | +2 attack off-course. |
| Waterspout | At the worst heading, travelling here is mandatory if able. After travel, four damage to every ship. | None. |
| Starlit Sea | Off-course Travel: every player raises threat by three. | +1 attack; +2 off-course. |
| Rolling Seas | Travel: shifts heading one setting off-course; cannot pay that cost at the worst heading. | Shifts off-course if the attack deals damage to a ship. |
| Fog Bank | Active: Ship enemies skip engagement checks, cannot attack and cannot be attacked. Optional engagement stays legal. | At the worst heading, the attacker makes one additional attack after this one. |
| Thrown Off Course | Either removes all current-quest progress and raises every player's threat by four, or shifts heading off-course. | Shifts off-course if the attack destroys a character. |
| Winds of Wrath | Off-course: one damage to every character. Its When Revealed effect cannot be cancelled at the worst heading. | Explicit choice: shift off-course or treat the attack as undefended. |
| Sudden Storms | Explicit choice: shift off-course or one damage to every exhausted character. | Excess attack damage is assigned to a ship controlled by the attacked player. Each shadow copy resolves separately. |

Damage choices preserve the affected player through hot-seat switches. Shadow consequences preserve the completed attack's damage/destruction facts; heading changes and extra attacks resolve at attack completion. Immune ships can still take encounter and framework damage. Ship destruction, exhaustion, resource costs, source-card blanking and save/reload use the shared engine pathways.

## Verification

`node --import tsx --test tests/voyage-belegaer.test.ts` covers normal/easy setup for 1–4 players, physical decks/fleet, hidden quest choices, all quest transitions and victory routes, Sailing symbols/ownership/reload, every encounter clause and shadow, travel, cost/draw/stat effects, ship elimination and malformed saves.

`node --import tsx scripts/browser-voyage-belegaer.mjs` exercises the actual React application at desktop and mobile widths: 1–4-player normal/easy opening, fleet ownership, private deck faces, Sailing commitment/results, stage choices, Boarding, encounter and shadow decisions, printed ship/quest inspection, local image decoding, reload and layout. It writes screenshots and a machine-readable report to `output/voyage-belegaer/`.
