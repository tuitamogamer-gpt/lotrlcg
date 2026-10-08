# The Three Trials — original and easy

`the-three-trials` adds sixteen encounter designs and five quest cards, sharing the three Ancient Forest designs from Into Fangorn. Exact Q04.5/E04.5 recipes contain 36/28 encounters; setting aside three Guardians, three Keys, three Barrows and Hallowed Circle leaves 26/18 cards. Difficulty is 5. All three trials must be completed, in any of their six orders, before the final stage. One to four players and official easy-mode starting resources are supported.

## Sources

- Pinned DragnCards catalog and Q04.5/E04.5 recipes in `public/catalog.json` and `public/scenarios.json`; imported definitions and recipes are retained in `src/data/three-trials-*.json`.
- [FFG rulesheet](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC27.pdf), including the distinction between the current trial and its current Key.
- Printed card faces, with all twenty-six front/back images cached locally. Printed Perseverance prohibits Guardian damage and departure; it does not prohibit declaring an attack.
- The Voice of Isengard Time rules place initial counters when a card is **revealed**. Guardian's Fury **adds** a Guardian from victory, so it returns with zero Time. The final quest explicitly **reveals** Guardians and initializes their counters.
- [Scenario guide](https://visionofthepalantir.com/2018/08/02/the-three-trials/) cross-checks setup and interactions. Printed cards and rules take precedence over guide shorthand.

## Implemented behavior

| Card / stage | Behavior |
| --- | --- |
| The Trials Begin | Mulligans finish before the first-player trial choice. Set-aside cards retain physical identities while revealed or attached. Seeded random selections draw only from remaining set-aside cards. |
| Strength | Reveal a random remaining Guardian and Barrow; attach the matching Key to the Guardian. All Guardians engage the first player. Barrows cannot become active and are immune to player effects, including pre-entry Warden of Arnor progress. Claiming the current Key places Barrows in victory and immediately advances. |
| Perseverance | Add a random Barrow without revealing it, attach a random remaining Key, then reveal its matching Guardian. Guardian damage, destruction and non-quest departure are prohibited. Claiming the current Key places Guardians in victory and advances. Attacks remain legal, dealing no damage. |
| Intuition | Reveal a random Guardian and Barrow, shuffle the encounter discard into the deck, then shuffle its matching Key into the bottom ten existing cards. Quest progress becomes an equal discard from the encounter deck after active-location buffers. Claiming the current Key places Guardians and Barrows in victory and advances. |
| The Antlered Crown | Add Hallowed Circle and reveal Guardians in victory, in a first-player ordering window. Each Guardian follows the controller of its matching Key. Victory requires the Circle in victory and at least one quest progress. |
| Key objectives | Unattached Keys must be claimed by a first-player hero without exhaustion. Discarded Keys return to staging, including host departure, cancelled/unused shadows and encounter-deck discards. A resolved Key shadow removes that physical shadow and shuffles the Key back without skipping subsequent shadows. |
| Guardian Time | Individual 2/3/4 counters. Refresh removes one from every timed enemy before ordering simultaneous deadlines. Boar discards a controlled ally, Wolf attacks immediately, Raven damages every character controlled by its engaged player. Each resets after its own consequences, including saved/nested attacks. |
| Hill / Stone / Cave Barrow | Hill deals a real additional shadow before defender declaration, preserving Silver Lamp visibility. Stone raises every player's threat after each Guardian attack, including attacks whose enemy died to a defender response. Cave enforces a shared five-ally limit through explicit discards. |
| Spirit / Cursed Forest | Spirit cannot have attachments and scales attack/threat with all controlled Keys. Forest travel searches deck/discard for a Spirit and adds it without revealing. Shared Tangled Woods costs still apply. Forest shadows remove enemy Time only after actual attack destruction. |
| Grim Foothills | Doomed 2 and threat equal to player count. Staging copies absorb progress before the active location, with first-player order choices and saved continuations. Remaining quest progress still reaches Intuition's replacement. Without an active location, Foothills does not intercept quest progress. |
| Hallowed Circle | Immune to player effects; threat equals player count. Travel exhausts three ready Key objectives, then all engaged Guardians attack in chosen order. Heroes themselves are not exhausted by the Key cost. |
| Curse / Guardian's Fury / Wild Tenacity | Curse damages nonunique characters and gains conditional Surge only with three controlled Keys. Fury attacks with every Guardian, or adds a random Guardian from victory if none are in play. Tenacity removes player-count Time from every timed enemy, with ordered simultaneous deadlines. Its Guardian shadow schedules both extra shadow effects during the current attack. |

Shared Turned Around now offers individual enemy Time counters as well as its existing quest-Time and active-location options. The centralized player-immunity helper covers printed and scenario-granted immunity across existing player-card handlers. Saves validate active/completed trials, hidden physical IDs, Key identity and individual counters; public state exposes trial progress and visible counters, without set-aside identities.

## Verification

- `tests/three-trials.test.ts`: 70 semantic checks, including 24 normal/easy multiplayer setups, all six full trial orders to victory, ownership, cancellation, progress replacement, individual/simultaneous Time, physical shadows, existing player-card interactions and save rejection.
- The full engine regression and focused follow-ups pass, including the additive account migration and its ownership/RLS checks. The 21 ordinary hot-seat checks pass separately from the long simulation matrix.
- Forty complete seeded Core learning-deck runs terminate; hidden/decisions/guided runs preserve outcomes. All forty stress games lost with these weak decks. Dedicated semantic and browser tests verify reachable victory.
- `scripts/browser-three-trials.mjs`: 66 checkpoints across 1280/390/320 pixels. Actual menu, trial choices, saved claims, travel, Cave discards, Time ordering, progress allocation, final Guardian attacks, victory and four-player easy mode. All twenty-six local faces decode, with no page errors or horizontal overflow. Desktop final-stage and 320px Time-order screenshots were visually inspected.
- `202610080001_three_trials_choices.sql` permits account choices and preserves the existing RLS policies, verified in local PGlite. No hosted Supabase migration was applied from this workspace.

Nightmare and campaign variants remain reference-only.
