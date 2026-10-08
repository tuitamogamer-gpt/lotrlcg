# The Wastes of Eriador

The original scenario supports one to four fellowships in standard and easy mode. It uses the Wastes of Eriador, Eriador Wilds and Foul Weather encounter sets. The runtime retains the existing canonical Lost Realm card identities and rules; it adds thirteen original encounter definitions and three quest cards.

## Sources

- [Original MEC39 adventure insert](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC39.pdf): Daybreak/Nightfall, optional Amarthiúl control transfer, and his mandatory leaves-play loss.
- Original English card faces linked by `src/data/pending/the-wastes-of-eriador-import.json`, retained locally under `public/cards/`.
- [Official FAQ 1.9](https://images-cdn.fantasyflightgames.com/filer_public/2e/31/2e3129b3-dc51-4c27-81ed-6a72f13e82f3/lotr_faq_19.pdf): cancellation, attack destruction, simultaneous Forced effects and resolving choices.
- [Official rules reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf).
- [Scenario analysis](https://visionofthepalantir.com/the-wastes-of-eriador/) supplies a secondary cross-check against the original cards.

The runtime corrects two source transcriptions after examining the original scans: Hunting Pack begins “While a player is making an engagement check,” and Amarthiúl says “the players lose the game.” Cold from Angmar reuses the already corrected Lost Realm definition; its original face has no inserted “Then” before attachment.

## Setup and time

Setup waits until every opening hand is kept. Pack Leader remains physically set aside. Shrouded Hills becomes the active location without being revealed or surging. Daybreak enters the staging area faceup. The first player takes control of Amarthiúl, then the shuffled encounter deck reveals one card per player.

Day prevents normal engagement checks. Optional engagement and engagements caused by card effects remain possible. Across the Wastes grants each hero one additional willpower during Day.

Night prevents progress on every quest card, including a selected side quest. Locations can still receive quest progress. Encounter card effects, including shadow effects, cannot be canceled during Night. Existing progress is retained unless a particular effect removes it.

The Time objective flips at the end of the round. A genuine change to Night reveals one encounter card for the whole table. The first player chooses the order of simultaneous Forced effects. Across the Wastes adds one threat to each fellowship when Night begins. Howling at Night discards one non-objective ally globally, or two for three or four surviving players. Its Day effect draws one card for each player. Daybreak returns all engaged enemies to staging, retaining their physical identity and damage and discarding their shadows. Reapplying the already visible face produces no second transition.

## Quest stages and victory

Across the Wastes needs twenty progress. Howling at Night needs fifteen. Entering Howling shuffles the encounter discard into the deck, discards until one Warg per player has been discarded, and adds the discarded enemies to staging. This adds enemies without revealing their When Revealed text or Surge.

Battle with the Pack turns Time to Nightfall, adds the same reserved Pack Leader, and performs the corresponding search for one fewer Warg than the number of players. Pack Leader cannot take damage until the main stage has at least five progress. A selected side quest's progress cannot unlock that gate. Becoming Day removes all progress from the main final stage.

Pack Leader's destruction immediately wins. While he remains in play, reaching five progress cannot complete the stage. His printed attachment and optional-engagement restrictions do not grant general immunity to player card effects.

## Encounter rules

| Card               | Implemented rule                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Northern Warg      | Its reveal boosts the Wargs currently in play until phase end. Its shadow moves the attacking enemy to the next player after the attack, then makes a fresh immediate attack with a new shadow.                       |
| Blood-thirsty Warg | A copy in staging when Night begins engages the first player and makes an immediate attack. That attack does not consume its ordinary combat attack.                                                                  |
| Hunting Pack       | Engagement checks count damaged characters of the player being checked. It cannot have attachments.                                                                                                                   |
| White Warg         | Engagement damages one controlled character, one during Day or two during Night. Its shadow creates an additional attack only during Night.                                                                           |
| Wolf of Angmar     | Surge; continuous Night attack bonus and the corresponding Day/Night shadow attack bonus.                                                                                                                             |
| Eriador Wastes     | While staged, current-quest progress is limited to five for the round. Multiple copies share that limit. Travel engages a staged Warg with the first player and deals that enemy a shadow.                            |
| Warg's Den         | Immune to player effects. Travel searches both encounter piles, reveals the chosen Warg with its ordinary reveal effects, and engages that physical copy with the first player.                                       |
| North Downs        | Continuous Night threat bonus. Its shadow adds attack and clears the current quest's progress if the attack destroys a character by attack strength.                                                                  |
| Sudden Darkness    | During Day it turns Time to Nightfall. During Night it adds four threat per player. Its shadow engages the topmost discarded Warg without revealing it and deals it a shadow.                                         |
| Predatory Wolves   | Each player separately chooses between discarding a highest-cost ally and searching for a Warg to reveal. Tied physical allies are selectable. Its shadow exhausts a controlled ready character.                      |
| Pack Leader        | Its engagement exhausts one controlled character for each Warg engaged with that player, including itself.                                                                                                            |
| Amarthiúl          | His controller may transfer him after another player's engagement. The first-player token does not transfer him. His departure loses the game even if his printed abilities were blanked, as specified in the insert. |

The shared Eriador Wilds and Foul Weather cards retain their original behavior: captured hands keep physical ownership through Lost in the Wilderness, Cold attaches to the physical current quest, Make Camp prevents healing, and quest-count modifiers include encounter and player side quests.

## Verification

`tests/wastes-eriador.test.ts` exercises real setup, travel, engagement and defense actions, Day/Night changes, quest advancement, both modes and all four player counts. Choices are saved and restored before selection. The scenario validator checks the objective, reserved boss and progress-tracking state.
