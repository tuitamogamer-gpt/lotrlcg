# The Voice of Isengard player cards

All fifteen printed player designs, `07001`–`07015`, are registered. Éomer, Westfold Outrider and Westfold Horse-breeder reuse the existing Rohan handlers; twelve definitions are new, including Gríma. This registration does not enable the expansion's encounter scenarios.

Sources: RingsDB identities and printing metadata in the imported catalog, local printed scans, and the [FFG Voice of Isengard rulesheet](https://images-cdn.fantasyflightgames.com/filer_public/cd/e6/cde67433-f555-4fbe-b45d-28dca420e7b3/the-voice-of-isengard-rulesheet.pdf). The rulesheet explicitly applies player Doomed when a card is “played or put into play.” Saruman therefore raises each player's threat by three even when another effect puts him into play without paying his cost.

| Cards | Executable behavior |
| --- | --- |
| Gríma | Once per round, reduce the next card played from hand by one and add Doomed 1. Zero-cost sphere requirements remain. Response events consume it; discard replays and put-into-play effects do not. |
| Saruman | Doomed 3, optional non-unique enemy/location target in staging, physical out-of-play storage until he leaves, and end-round discard. Guarded objectives follow their guardian out of play. Returning the cards creates no reveal or entry trigger. |
| Orthanc Guard, Isengard Messenger, Keys of Orthanc | Separate optional responses to actual Doomed threat increases; readying, two willpower boosts per round, or an exhausted attachment's resource gain. Controllers and attached heroes can belong to different players. |
| Rohan Warhorse | Restricted attachment to a Tactics **or** Rohan hero; exhaust the horse to ready the attacking hero after an enemy kill. |
| Silver Lamp | Attach to a Spirit hero. Shadows dealt to that player's engaged enemies are faceup while the hero is ready. Physical visibility survives exhaustion, shadow removal, nested attacks and reload; shadow effects still wait for their normal window. |
| Legacy of Númenor, Deep Knowledge | Doomed first, then one resource per eligible hero or two cards drawn by every player, respecting gain/draw restrictions. |
| The Wizard's Voice | Each player chooses an engaged enemy whose attacks against that player are prevented for the phase. |
| Power of Orthanc | Each player may discard one Condition anywhere in play, including the legacy Iron Shackles representation. |
| The Seeing-stone | Search the actual deck for a printed Doomed card, optionally take it and shuffle. The resolving event remains outside the deck/discard search. |

Doomed is separate from normal threat increases. Ally keywords resolve after physical entry but before entry responses, including older allies such as Gandalf and Snowbourn Scout. Encounter Doomed responses resolve before the encounter's When Revealed choice. Pending queues and keyword choices remain serializable.

Evidence: `tests/voice-isengard.test.ts` covers registration, cost/payment origin, printed Doomed on free entry, pre-response threat elimination, per-player effects, round limits, Saruman's physical return, legal attachment targets, shadow privacy/removal and pending reloads. `npm run test:against-shadow-finale` uses actual Gríma/Saruman and Silver Lamp controls at 1280/390/320px. Front scans are locally cached.
