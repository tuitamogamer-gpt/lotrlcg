# The Treachery of Rhudaur — original scenario

The import follows the original Treachery of Rhudaur cards, its printed investigation rules, and normal/easy recipes `Q05.7` and `E05.7` for one to four players. Campaign mode is described with the Angmar Awakened campaign; Nightmare mode follows below.

The source snapshot is `src/data/pending/the-treachery-of-rhudaur-import.json`. Native insert faces are [rules front](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/d0ab3d77-e84b-41b8-bb9b-f9be302ef1ef.jpg) and [rules back](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/d0ab3d77-e84b-41b8-bb9b-f9be302ef1ef.B.jpg). Eight previously scripted Cursed Dead, Arnor, and Eriador definitions retain their canonical IDs. Original Clue backs use their own canonical objective definitions, with physical identity preserved across the flip and claim.

## Investigation, Time, and Clues

The Great Hall begins active, Thaurdir begins set aside, and the three investigation side quests begin faceup in staging. Setup adds one Ancient Causeway, or two for three/four players, without revealing them. The first player receives Amarthiúl. Secrets of Rhudaur begins with Time 5 and cannot be chosen as current during the quest phase.

Defeating an investigation side quest turns that same physical card into its Clue objective in staging. It does not enter the victory display. Sift Through the Debris becomes Heirloom of Iârchon, Quiet the Spirits becomes Daechanar's Brand, and Decipher Ancient Texts becomes Orders from Angmar. Claims pay exhaustion from the triggering player's hero or controlled Amarthiúl, then attach the same physical Clue. A departing bearer returns that Clue to staging. Heirloom adds willpower; Brand/Orders apply only during attacks/defense against Undead enemies.

Time remains on the printed main quest while a side quest is current. On expiration, only remaining quest-front investigation cards are removed from the game. Already discovered Clue objectives remain. Discovering all three Clues advances immediately. Stage two adds the set-aside Thaurdir and lets each player find an Undead enemy. Its 30-point target decreases by five per Clue attached to a character. It cannot be defeated while Thaurdir has hit points remaining.

Amarthiúl's engagement control transfer remains optional and does not follow first-player rotation. The printed insert explicitly makes loss on his departure unmodifiable by card effects.

## Physical progress and location rules

Noncurrent Forced progress targets the indicated physical side quest without changing the phase's current quest. Enemy destruction adds two to Quiet the Spirits; location exploration adds two to Sift Through the Debris. Decipher Ancient Texts pays a real hero resource and shares its three-times-per-round limit across all players. Its ally willpower penalty and Sift's location-threat bonus apply only while that quest is current.

Each staging Forbidden Descent replaces its first two quest progress each round. Replacement progress can explore that location, after which its Forced threat and other exploration effects resolve before remaining progress resumes on the original quest. Leaving staging by another route also triggers its threat increase. Each staging Decrepit Remains adds two quest points to staging locations/quests. Haunting Fog adds six to its physical host. A reduced goal can immediately defeat a side quest whose existing progress reaches that goal.

Quiet the Spirits sends entering Undead to a highest-threat player. A tie is a first-player choice. Those enemies contribute their threat while engaged through the end of the phase. Great Hall discards five cards per player and offers only their discarded Undead; Ghostly Ruins returns the topmost Undead once per deck depletion, including combat, before deck reset. Its Travel cost returns another topmost Undead.

## Treacheries, shadows, and Thaurdir

Curse of the Years damages exhausted characters and separately discards exhausted attachments controlled by players at threat 35+. Dark Covenant computes discarded printed threat, then offers a fully payable quest-progress removal or damage assignment. Assigned damage is grouped per character before application. Centuries of Sorrow changes the actual current quest. Haunting Fog exhausts each player's character and independently attaches to the current quest. Eerie Halls' Action pays threat to reduce that physical location until phase end. Wight of Rhudaur receives Surge or Doomed 2 from current quest progress.

Thaurdir is indestructible, cannot have attachments, and heals three before making a real first-player attack after a Sorcery treachery is revealed from the encounter deck. Canceling When Revealed does not cancel this reveal reaction. Shadow choices use the defending player's controlled Clues; shadows can add attack, declare an attack undefended, make an additional attack, remove progress per actual combat damage, or raise threat from destroyed characters' willpower. Nested attacks and serialized choices retain the original attacked player.

Semantic/save/multiplayer checks are in `tests/rhudaur.test.ts` and fixture helpers in `tests/rhudaur-fixtures.ts`.

## Nightmare mode

The Nightmare Deck (recipe `N05.7`, [rules and cards](NIGHTMARE.md#the-treachery-of-rhudaur-nightmare)) removes Decrepit Remains ×2, Eerie Halls ×2, Dark Covenant ×1, Ruins of Arnor ×2, Tragic Discovery ×2 and Cursed Dead ×5 and adds Thaurdir's Hunter, Undead Thrall, Forgotten Courtyard, Charred Cellar and Malevolent Forces (2 of each) to the encounter deck. Its setup card sets aside the three side quests' encounter sets (Sift through the Debris: Secret Antechamber; Decipher Ancient Texts: Life Drain; Quiet the Spirits: Apostate of Angmar; 3 of each), out of play. After the players advance to stage 2B, once stage 2A's When Revealed effect and its search for Undead enemies have resolved, the set of each side quest that was not defeated (removed from the game when Time ran out) is shuffled into the encounter deck with the encounter discard pile; the discard pile is shuffled in even when each side quest was defeated.

Thaurdir's Hunter asks for its choice (a time counter from the main quest, or an undefended attack) before its defenders are declared, so a defender chosen for an attack that becomes undefended stays ready. Life Drain, revealed, is dealt to Thaurdir as a shadow card; the Sorcery attack its reveal triggers takes a fresh shadow card, and Life Drain waits for his next attack. Attached to Thaurdir by its shadow effect, Life Drain stays despite his "Cannot have attachments" and counts as a Condition attachment. Forgotten Courtyard counts Undead enemies added to the staging area or put into play engaged, not those returning to the staging area. Focused checks are in `tests/nightmare-rhudaur.test.ts`.
