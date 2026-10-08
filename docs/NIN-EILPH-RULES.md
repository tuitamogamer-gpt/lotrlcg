# The Nîn-in-Eilph — original and easy

`the-nin-in-eilph` imports ten encounter definitions and eight quest cards. Three Weary Travellers encounters reuse Into Fangorn scripts. Exact Q04.7/E04.7 recipes contain 31/25 physical encounters; removing Nalir and the Ancient Marsh-dweller leaves 29/23, before each player chooses a different starting location. Difficulty is 4; one to four players and official easy starting resources are supported.

## Sources

- Pinned catalog and Q04.7/E04.7 recipes; original rows are retained in `src/data/nin-eilph-*.json`. The source encounter-set name lacks the accent in Nîn; registration preserves that exact identifier.
- [Official FFG rulesheet](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC29.pdf): random parallel advancement excludes the current card, returns the old card to the available pool and loses all quest progress.
- Printed cards, with all twenty-six front/back faces cached locally.
- [Scenario guide](https://visionofthepalantir.com/2018/08/09/the-nin-in-eilph/) and [Hall of Beorn product](https://hallofbeorn.com/LotR/Products/The-Nin-in-Eilph?View=Browse), checked against printed wording. Moving existing resources differs from adding resources; adding a searched card to hand differs from drawing.

## Implemented rules

| Card / stage | Behavior |
| --- | --- |
| Fleeing from Tharbad | Mulligans finish before physical setup. Nalir joins the first player, the Dweller is set aside and each player chooses a different swamp location. Seeded random selection starts one of three stage-two cards. |
| Lost in the Swamp | Stage-two and stage-three variants have Time 3. Expiration selects a different variant of the same stage and resets progress; progress completion advances normally. Front-side effects finish before new Time counters appear. Ordinary defeat triggers quest-attachment responses; mere parallel advancement does not. |
| No End in Sight | Blocks card-effect draws and resource additions, including hero actions, entry responses, events and passive collection bonuses. The ordinary one card and one resource per hero remain. Legal transfers between pools and searches that add to hand still work. Unusable draw-only actions/events cannot pay costs. |
| A Forgotten Land | Each player may play one card per round, including response events and free plays. Earlier plays in the same round count after a parallel change. Putting a card into play is distinct from playing it. |
| A Weary Passage | Each player's ordinary commitment pays one random hand discard before committing characters; discard reactions resolve first. No hand means no ordinary commitment. Committing no characters is legal and costs nothing. |
| Impassable Marshland / A Treacherous Swamp / Creatures of the Swamp | Locations gain threat; each player chooses up to five characters to ready during refresh; or staging Creatures gain -20 engagement cost. The refresh limit persists through additional readying effects in that phase. |
| Out of the Swamp | Returns and heals the Dweller, resolves its attack against each player, then places Time 2. Expiration repeats the attacks before resetting Time. Only defeating the Dweller at this stage wins; discarding it and quest progress do not. |
| Ancient Marsh-dweller | Each removal of any number of Time counters adds one resource and increases its stats. Returning an in-play copy preserves its identity and tokens, healing damage; re-entry from outside play resets tokens. Earlier defeat goes to victory and the next stage can retrieve it. |
| Giant Swamp Adder / Neekerbreekers | Time removal triggers engaged copies only: immediate attacks or two damage to a controlled ally. Simultaneous effects and stage expiration are explicitly ordered by the first player and survive reload. |
| Nalir | Preserves physical identity and follows the first player. His refresh threat precedes readying. Any departure loses the game. Shared objective-ally rules recognize both official Nalir printings. |
| Fen / Bog / Finger / Eyot | New-stage Fen exhaustion, non-stacking Item stat penalties, end-round location-progress erosion, per-player travel exhaustion and optional exploration Time gain are implemented. |
| Remnants / Shifting Marshland | Uncancelable Creature search from deck/discard puts each choice into engagement without revealing it. Shifting removes Time and retains printed Surge; canceling its When Revealed effect does not cancel the keyword. |
| Shadows | Current-Time attack bonus, attachment-based defense penalties, direct defender damage, additional attacks and removal of quest progress after actual attack destruction. Repeated damage shadows handle a defender already destroyed by an earlier shadow. |

The quest face, variant name, Time counter, goals and event review reflect the active parallel card. Saved states validate variant/stage correspondence, Time, physical set-aside identity and combat penalties. An additive account migration is tested locally; no hosted Supabase migration has been applied.

## Verification

`tests/nin-eilph.test.ts` contains 58 semantic cases, including all nine middle-stage combinations, real combat victory, both recipes at one to four players, simultaneous deadlines, physical boss re-entry, economy restrictions, response events, malformed saves and repeated shadows. All 2,260 non-simulation regression cases and 21 ordinary hot-seat cases pass. The responsive browser suite passes 69 checkpoints for actual menu, setup, commitment, play limits, Time decisions, refresh choices, travel, search and victory at 1280/390/320 pixels, including all twenty-six local image decodes. Desktop victory and 320px travel-choice screenshots were visually reviewed. Forty complete Core learning-deck stress games and hidden/decisions/guided parity checks complete successfully; all forty stress games lost, while explicit rules/client fixtures reach victory. The non-Core campaign simulation is intentionally skipped. TypeScript, production build and local account/RLS checks pass.

Nightmare and campaign variants remain reference-only.
