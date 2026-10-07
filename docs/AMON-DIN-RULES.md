# Encounter at Amon Dîn — original and easy

The scripted scenario uses the two original quest stages, all 13 printed encounter definitions from Encounter at Amon Dîn, and the existing Ravaging Orcs set from Heirs of Númenor. Nightmare and campaign variants remain separate catalog entries.

## Printed sources

- [Fantasy Flight Games rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/f3/24/f324894b-7079-402d-a2b7-e831442bbbb0/rulesheet-encounter-at-amon-din.pdf): encounter-set composition, Villagers keyword, token identity and final comparison.
- [Printed Savagery of the Orcs, side B](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/fd89bdbf-7475-4f3e-96fc-8f5315a93001.B.jpg): Villagers 5 and replacement of progress with rescued villagers. The reference catalog omitted the keyword; the runtime definition restores it.
- [Printed Ghulat](https://dragncards-lotrlcg.s3.amazonaws.com/cards/English/fd89bdbf-7475-4f3e-96fc-8f5315a93071.jpg): variable attack, attack trigger and restriction on ending the game.
- [Official FAQ 1.9, section 1.37](https://images-cdn.fantasyflightgames.com/filer_public/2e/31/2e3129b3-dc51-4c27-81ed-6a72f13e82f3/lotr_faq_19.pdf): effects using “when” resolve before effects using “after”; cancellation interrupts that structure.
- Printed definitions and exact scenario recipes are extracted from the repository's DragnCards catalog (`public/catalog.json`, `public/scenarios.json`), retaining source metadata and original identifiers.

## Implemented semantics

Setup puts Lord Alcaron under the first player's control, both villager objectives in staging, one Burning Farmhouse active and Ghulat aside. The encounter deck has 33 cards after setup in original mode and 26 in easy mode; setup then reveals one card per player. Easy mode excludes Craven Eagle, Burnt Homestead and Orc Rabble.

A fresh location receives its printed Villagers count when it enters play, including during setup or canceled When Revealed effects. Moving between staging and active preserves its tokens. Exploring any location transfers its villagers to Rescued Villagers and places the location in the victory display. Tokens on locations and Rescued Villagers use the unit's serialized `resources` field solely as villager counters; the five stage-one villagers use `amonDin.questVillagers`. They are not spendable player resources. Dead Villagers uses its serialized damage counter.

Stage-one quest progress first clears the active location, then rescues the same number of remaining quest villagers. Removing the fifth advances to stage two; excess progress does not enter the new stage. Stage two adds Ghulat and requires 15 progress. Its undefended-attack replacement discards the available rescued tokens instead of assigning damage to a hero, including when fewer tokens remain than attack strength.

Discarding villagers offers Lord Alcaron's controller an explicit optional location choice. He must be ready and able to exhaust; a simultaneous multi-token discard offers one opportunity to save one villager. The saved token moves to the chosen location instead of becoming a death; the rest increment Dead Villagers. Direct deaths from Ghulat and Marauding Orc offer no Alcaron response. Alcaron follows changes to the first player with his identity and state intact. Destruction, discard and player elimination that cause him to leave play lose the scenario.

Burning Farmhouses discard at round end, after ordinary refresh readying. Gondorian Hamlet triggers while in staging after an encounter treachery is revealed: its When Revealed effect and cancellation window resolve first, then Hamlet discards its villager. Canceling the When Revealed effect does not cancel the Hamlet trigger. Eleanor resolves the original reveal’s Hamlet trigger before revealing the replacement card. This order also means Burnt Homestead computes its threat increase before Hamlet creates a new death. Secluded Farmhouse's encounter reveal resolves before travel completes. Craven Eagle lets the first player resolve lowest-remaining-HP ties, then gives the chosen character's controller the printed prevention choice; its three random discards use the saved deterministic RNG state. Panicked! resolves each player's location choice in player order, moves actual tokens and surges only if none were moved.

Ghulat's attack trigger increments deaths before its variable attack is calculated. Prevented attacks do not trigger it. Marauding Orc and conditional shadows use actual character destruction by that attack, preserving their flags through serialized combat. Undefended attacks in stage two do not destroy characters merely by discarding villagers. Variable threat and attack shadows use current death counters.

An unblanked Ghulat in play prevents ending the completed quest. Once that restriction is gone, strictly more rescued villagers than deaths wins; a tie does not meet the printed victory requirement. Ordinary player elimination and Alcaron's immediate defeat condition still operate.

## Verification

`node --import tsx --test tests/amon-din.test.ts` covers the real scenario registration and setup, both recipes, public progress and travel operations, actual defense and damage resolution, optional responses, multi-player choice ownership, cancellation timing, deterministic random prevention, pending-choice reloads, Alcaron's control/leave-play conditions, conditional shadows and the final comparison. Shared browser verification is maintained by the integration task.
