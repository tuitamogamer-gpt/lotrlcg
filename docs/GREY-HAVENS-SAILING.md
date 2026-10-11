# The Grey Havens: Sailing and ship rules

The original deluxe expansion now uses a shared, serializable Sailing test and
the printed Ship objective / Ship enemy combat rules. Voyage Across Belegaer
performs its main quest's Sailing test at the beginning of each quest phase,
before quest commitment and encounter or player side quest selection.

## Sources

- [Official original deluxe rules PDF](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf), pages 5–6; cached at `output/mec47_rules.pdf` with searchable text at `output/mec47_rules.txt`.
- Original rule-card scans `public/cards/c59be48d-ccec-4409-92b3-9f2e74f01012{,.B}.jpg`, `29349448-e37d-4741-a7df-4bb57c195437{,.B}.jpg`, and `a1bb437e-1cbc-4780-bbee-f9ad07cb8d7a{,.B}.jpg`.
- [Verified printed wheel metadata](../src/data/grey-havens-sailing-icons.json), including every original encounter front's source image and SHA-256. Calm Waters has two wheels; Rough Waters, Thrown Off Course, Winds of Wrath, Starlit Sea and Rolling Seas each have one. The other original deluxe encounter fronts have none.

The older rule-card scan says the heading stays unchanged when no characters
were committed. The current official original deluxe PDF omits that condition:
each wheel on a looked card may shift the heading on-course. This implementation
follows the current official PDF. Calm Waters therefore permits its two extra
cards to produce successful heading shifts even with no committed characters.
An empty commitment without an extra-look effect still looks at zero cards.

## Implemented procedure

1. Shift the shared fleet heading one step off-course, capped at the worst heading.
2. The first player chooses any number of ready controlled characters and exhausts each actual participant. The Dream-chaser may participate under another player's control and contributes two cards. Sailing commitment does not commit the character to the quest.
3. Finish commitment and confirm the looked-card step. This confirmation is a review pause, not a player Action window. The rules explicitly allow Actions before and after a Sailing test, and forbid them during the test.
4. Look at the number of cards contributed, plus two for each active Calm Waters. If the encounter deck is too short, shuffle the encounter discard pile into the existing deck before looking.
5. Count the printed wheel symbols and cancel one for each Rough Waters in staging. Choose how many uncancelled successes to spend shifting on-course; the heading cannot pass the best position.
6. Discard every looked card and resume the suspended quest-start continuation. Looking never reveals cards and does not resolve Surge, Doomed, When Revealed, or encounter cancellation responses.

`s.sailing.heading` is `0` (on-course) through `3` (worst heading). The nested test
stores its first player, physical committed IDs, looked codes, counted successes,
and suspended effects. Commitment, the review pause, and the optional result
choice all survive restoration. Save validation rejects malformed headings,
players, duplicate commitments, incorrect result shape, and invalid effects.
`publicState` includes only Sailing information actually seen by the players.

## Ships

Ship objectives live in their controller's ally area and count as allies and
characters. They quest, exhaust, ready and take damage normally, subject to their
printed immunity and abilities. Ship enemies count as enemies for engagement,
staging threat, reveal timing, shadows, attacks and destruction.

- Ordinary characters may attack Ship enemies. Ship objectives may attack only Ship enemies.
- Ship enemies may be defended only by Ship objectives. Ship objectives may defend only Ship enemies.
- Sentinel still allows a controlled ship to defend another player's ship attack.
- Undefended damage from a ship attack goes to one ship controlled by the attacked player.
- Destroying the Dream-chaser loses the voyage. Destroying another ship eliminates its controller; objective cards never enter that player's discard pile.

The scenario module owns fleet selection, Corsair deck/discard routing, Boarding,
ship printed abilities and encounter-specific rules. Shared combat and save
helpers enforce the printed restrictions independently of the UI.

## Validation

`tests/grey-havens-sailing.test.ts` covers symbol provenance, shared heading
boundaries, Dream-chaser counting, first-player control, optional success spending,
stacking cancellation, Calm Waters extra looks, pre-look reshuffling, suppression
of encounter triggers, blocked player Actions, restoration and corruption,
combat declarations and ship destruction. The Voyage tests additionally cover
fleet setup for 1–4 players in normal/easy mode, Boarding origin, Corsair zones,
Fog Bank, engagement modifiers, cancellation restrictions and shadow timing.
