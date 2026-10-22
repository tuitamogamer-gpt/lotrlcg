# Ered Mithrin: the final two player packs

The twenty original player designs from **Mount Gundabad** (`19112`–`19121`)
and **The Fate of Wilderland** (`19145`–`19154`) have native rules. Armor of
Erebor retains its existing complete canonical definition and passive rules;
the other nineteen designs add definitions. All twenty source records remain
distinct in `src/data/ered-final-player-cards.json`. The official catalog and
official player-card source are unchanged.

All twenty original card faces were read directly. Their DragnCards UUID
source URLs, local `/cards/{code}.jpg` files, byte counts and SHA256 values are
pinned in `tests/ered-final-player-art.ts`; together they contain **3,007,337
bytes**. Messenger Raven's runtime transcription repairs “of have” to “or
have” and “it's owner's” to “its owner's.” Mithril Shirt prints Guarded
(location) once, so the duplicated catalog keyword is removed for display.

Radagast and Reforged intentionally retain their designer-confirmed errata,
even though the original scans have older text. Radagast conditionally gains
the other three printed sphere icons while playing a Creature ally; this
also permits a Staff-discounted zero-cost play. Reforged plays an **Item**
attachment and permits a sphere mismatch. Designer clarification 3.384
confirms both changes. The [source audit](ERED-MITHRIN-FINALE-SOURCES.md)
distinguishes original scans, official general rules and reproduced designer
correspondence; the latter is not a publisher-issued FAQ.

| Card               | Native behavior                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bilbo Baggins      | Optional commitment response uses an enemy's current threat when chosen, grants that much willpower, and schedules damage after a successful quest. Each commitment can establish another independent instance. An enemy guarding a card takes two damage; scenario custody zones count as guarding. |
| Greenwood Defender | Optional entry response permits defending without exhausting for the rest of the round.                                                                                                                                                                                                              |
| Elf Guide          | Returns a controlled Silvan ally as the event's cost, then adds one resource to a chosen hero's pool.                                                                                                                                                                                                |
| Gaffer Gamgee      | During combat, returns himself to hand to stop a qualifying enemy's attacks against his controller for the round. Effective threat and engagement cost determine eligibility.                                                                                                                        |
| Drinking Song      | Counts the current hand, shuffles its physical cards into the deck, then draws that many cards plus one for a controlled unique Hobbit. Borrowed cards retain their owners. An incomplete shuffle does not satisfy “Then.”                                                                           |
| Sting              | Guarded (enemy), Restricted, and +1 willpower, attack and defense on its Hobbit hero. Its declaration response deals damage before attack resolution.                                                                                                                                                |
| Round Shield       | Its optional response exhausts the attachment to give its attached character +2 defense for the current attack after a shadow effect triggers.                                                                                                                                                       |
| Erebor Toymaker    | Playing him from hand can reduce the **group's** next attachment cost that phase by two; putting him into play does not qualify.                                                                                                                                                                     |
| Armor of Erebor    | Reuses the existing Dale/Dwarf attachment restriction, +1 defense, Sentinel and Restricted rules exactly once.                                                                                                                                                                                       |
| The Shirefolk      | Lowers threat only when every controlled hero is a Hobbit, including allies converted into heroes.                                                                                                                                                                                                   |
| Radagast           | Conditional Creature ally resource matching and an optional response to playing a Creature card that permits questing without exhausting for the round. Putting an ally into play does not trigger it.                                                                                               |
| Messenger Raven    | Cannot fight or have attachments. Its Refresh Action returns it to hand, names a card type before inspection, then adds a matching player's top card to that player's hand or discards a mismatch.                                                                                                   |
| The King's Return  | Searches the actual deck for a Guarded attachment, puts it into play, and shuffles. Entering play still resolves its Guarded keyword.                                                                                                                                                                |
| Loyal Hound        | Cannot have attachments. Discarding a controlled Hound as a cost prevents one or two damage just assigned to that player's hero.                                                                                                                                                                     |
| The Great Hunt     | Requires the three printed hero resource pools during combat and discards a non-unique staging enemy. Direct discard does not defeat the enemy, award Victory or resolve defeat-only effects.                                                                                                        |
| Bywater Shirriff   | Gains +1 willpower, attack and defense while its controller is engaged with an enemy whose engagement cost exceeds that player's effective threat.                                                                                                                                                   |
| Gwaihir's Debt     | Requires different controlled unique Istari and Eagle characters. Searches the top five for an Eagle or Istari ally, puts it into play and shuffles. That physical ally returns at round end unless it has already left play.                                                                        |
| Mithril Shirt      | Guarded (location), with one damage prevented per damage assignment to its hero. Prevention does not exhaust the attachment and is not a once-per-round limit.                                                                                                                                       |
| Reforged           | Chooses an actual Item in any player's discard, pays its printed cost as X in Spirit, then plays it without another payment. Supports X=0, legal attachment targets, physical ownership and discard-play restrictions.                                                                               |
| Radagast's Staff   | Attaches to hero or ally Radagast. Exhausting it chooses one mode: reduce its controller's next Creature ally cost that phase by two, ready a Creature ally, or return a non-unique Creature engaged with its controller to staging.                                                                 |

Guarded (X) applies on **every entry into play**, including The King's Return
and Reforged, as confirmed by the original Wilds of Rhovanion insert and
designer clarification 3.283. Searches discard without revealing, respect
the required enemy/location type, and retain the attachment's physical
identity and owner through guarding and claim. If the possible encounter
pool contains no eligible guard, the attachment is claimed after that pool
is exhausted, following clarification 3.286.

Bilbo's willpower amount is fixed when his response resolves, following FAQ
1.55 for lasting effects. The established delayed damage survives Bilbo
leaving play; a departed target is no longer damaged. Recommitting can
establish multiple instances, as clarified in 3.289. Round Shield checks
whether a shadow effect was triggered: canceling that effect still allows
its response, while a card with no effective shadow text does not, as
clarified in 3.298.

The two new player modules use structured Actions and Responses, physical
discard/deck bindings and serialized continuations. Costs are paid before
the corresponding ability resolves. Staff discounts remain personal;
Toymaker's next-attachment discount is shared within the current play area.
Established phase and round effects survive their source leaving play and
expire at the appropriate boundary. Damage prevention records the physical
sources already offered for an assignment, so declining or resuming after
a JSON reload cannot loop the same offer.

The focused player suite covers all twenty designs, every pinned image,
real plays and put-into-play effects, legal and illegal targets, payment,
physical ownership, repeated commitments, guarded searches, source
departure, and one-to-four-player save reloads. Separate integration tests
exercise Hasty Stroke through the actual shadow pipeline, a shadow without
an effect, and Sting killing an attacker before its combat damage. The
dedicated browser suite checks the original faces and actual interaction
controls at 1280, 390 and 320 pixels; its release results are recorded in the
[finale verification document](ERED-MITHRIN-FINALE.md).
