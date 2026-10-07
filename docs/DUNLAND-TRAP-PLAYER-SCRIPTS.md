# The Dunland Trap player cards

All ten designs (`08001`–`08010`) are registered. Celeborn, Naith Guide and The Tree People reuse the Silvan scripts; Firefoot reuses the Rohan scripts; Blue Mountain Trader reuses the Collector scripts. Five player definitions are newly registered. The encounter scenario and the Voice of Isengard quests remain pending.

Printed identities, current text and errata come from the pinned RingsDB catalog in `public/catalog.json`; the pack snapshot is `src/data/dunland-trap-player-cards.json`. Original scans for the five new designs and Trader are cached locally. Runtime card definitions retain their original product provenance.

| Card | Executable behavior |
| --- | --- |
| Swift and Silent | Ready an eligible exhausted hero you control. The first play this round returns its own physical event at threat 20 or less. Canceled plays count; replays and free deck plays share the limit. Gríma's Doomed resolves before the threat check. |
| Close Call | Optional hero-damage cancellation, including lethal and another player's damage. Choose X; Doomed X affects every player before damage resumes, including keyword responses and elimination. Gríma adds Doomed 1. Printed cancellation restrictions, Counter-Spell, costs and subsequent damage replacements remain active. |
| Blue Mountain Trader | Transfer the actual ally with its exhaustion, damage and original owner intact. The recipient chooses the resource transfer or discard. The once-per-round limit follows the card across controllers. A transfer can use a resource that cannot be spent, and triggers Heir of Mardil on its recipient. |
| The Fall of Gil-Galad | One copy per deck; attach to a hero. Destruction offers an optional response using that attached Song's actual discard slot and printed hero threat. Move that copy to the victory display and reduce the attachment controller's threat. Discarding a hero without destruction does not trigger it; losing the last hero still eliminates the player. |
| Ithilien Lookout | Secrecy 2 and an optional entry response. Look at the actual encounter top card, then optionally discard it only if it is an enemy. Inspection is separate from revealing, leaves the rest of the deck ordered, and survives reload. |
| The White Council | Resource cost equals the current player count, including ordinary modifiers and paid discard replays. Choices follow first-player order, use a different option for each player and affect that player's heroes/deck. The resolving event cannot select itself from discard. |

The Seeing-stone recognizes printed Doomed X. Close Call adds a serializable damage-cancellation continuation; no hidden choice or replay state depends on closures.

Validation: `tests/dunland-trap-player.test.ts` checks public actions, physical card destinations, multiplayer ownership, legality, keywords, canceled events, round limits, first-player order and saved decisions. `npm run test:ring-maker-players` exercises actual play payments, targets, X choices, inspection and reload at 1280/390/320px. The existing Silvan, Rohan and Collector semantic suites continue to cover the reused designs.
