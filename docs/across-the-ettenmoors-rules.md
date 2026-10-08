# Across the Ettenmoors — original scenario

The import uses the original Across the Ettenmoors cards, the two sides of its printed rules card, and the official normal/easy recipes `Q05.6` and `E05.6`. It supports one to four players. Campaign and Nightmare are separate products.

Sources are preserved in `src/data/pending/across-the-ettenmoors-import.json`. The printed insert is available at [rules front](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/788819a1-c0b5-4dd0-b778-f3011ca05175.jpg) and [rules back](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/788819a1-c0b5-4dd0-b778-f3011ca05175.B.jpg). Runtime definitions preserve canonical encounter IDs; the nine Eriador Wilds/Foul Weather cards reuse their existing definitions and scripts. In particular, the original Cold from Angmar attachment is independent of its damage instruction; the catalog's added “Then” does not override the corrected original definition.

## Objective-locations and Safe

The four Safe cards are objective-locations. They follow location rules for travel, active-location buffering, exploration, encounter location effects, and their printed Victory 5, while having no threat value. Runtime `type_code: location` with `objectiveLocation: true` preserves those location interactions and the original card label.

A Safe remains untravelable while an enemy, location, or encounter side quest is guarding its physical card. Travelling to its guarding location does not travel to the Safe. When the guard leaves play, the Safe is available in staging. Troll-fells revealed as a Safe's guard does not search for a second Safe. A Safe fetched by Troll-fells is guarded by that physical Troll-fells and does not reveal another guard.

Travelling to Safe immediately returns every player's engaged enemies to staging and discards every No Rest. While Safe is active, all treachery When Revealed effects are ignored, all encounter side-quest printed text is blank, and engagement checks are skipped. Treachery Surge and Doomed still resolve. Ignoring text does not trigger “When Revealed was canceled” reactions. At the end of the quest phase, an active Safe goes to victory even if it was not explored. Side-quest text then becomes live again.

Safe travel Responses are optional. Woods adds one resource to each hero; Cave draws three per living player; Hoarwell heals one from every character; Camp lets each player choose a discarded card or decline. Each travel Response is one ability with its subsequent player choices inside that resolution.

## Stages and side quests

Setup selects one of the three scenario side quests and one of the four Safes at random, with that side quest guarding the Safe. One Trollspawn per player starts in staging. The unused Trollspawn remain in the encounter deck alongside the remaining side quests and Safes. Normal setup leaves `45 - player count` cards in the deck; easy setup leaves `32 - player count`.

Stage one adds a discarded side quest without revealing it if none is in play at quest-phase start. Current-quest selection follows that effect. Defeating any side quest adds its quest points directly to the main stage, including when Safe blanked the side quest's own text. Stages two and three shuffle the encounter discard into the deck, discard to a side quest, and genuinely reveal it. Stage two reveals an extra card unless Safe is active. Stage three gives damaged characters −2 willpower unless Safe is active; 17 progress defeats it.

Lie Low records actual progress placement on its physical card during the round. Removing those tokens later does not retroactively enable its end-of-quest engagement penalty. Its defeat Response shuffles a staging enemy. Forage damages each actual hero resource payer once per payment from that pool; gains, transfers, and losses do not count as spending. Its defeat Response heals every hero. Scavenge increases player-card play costs and, on defeat, finds a Troll for the highest-threat player before each player may play a hand card for free. Tied highest threat is a first-player decision. Free play retains printed play restrictions, targets, event resolution, and Doomed.

## Encounter and shadow behavior

No Rest prioritizes globally exhausted heroes and applies its one-per-hero limit. It blocks readying and resource-phase collection. Barren Moorland triggers once per staging copy when an ally enters, offering legal exhaustion or one damage; its travel cost damages each exhausted character. Arador's Bane resolves in player order, offers only staging enemies whose engagement exceeds that player's threat, and deals two physical shadows to each enemy engaged through its effect.

Trollspawn counts damaged characters controlled by the engaged player. Ruthless Hill-troll gains its attack/defense bonus at three damage. Goblin Pursuer rejects damaged attackers and defenders. Coldfell Giant deals one damage to up to three distinct controlled characters. Cruel Mountain-troll removes excess combat damage as progress from every quest in play. Shadows implement the defending player's damaged-character count, damaged-defender additional attack, undefended attack bonus, and Safe shuffle while leaving its guard in play.

Amarthiúl's engagement control transfer is an optional Response controlled by his current player. He does not follow the first-player token. His departure loses the game, including when his printed text is blank.

Semantic/save/multiplayer checks are in `tests/ettenmoors.test.ts` and save-valid fixture helpers in `tests/ettenmoors-fixtures.ts`.
