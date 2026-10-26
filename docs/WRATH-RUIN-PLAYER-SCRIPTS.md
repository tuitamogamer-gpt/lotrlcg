# Wrath and Ruin player scripts

The original pack has eleven player designs. Four were already registered by earlier starter/player imports; their definitions and original Wrath and Ruin art are refreshed without registering a second runtime card. The Burglar's Turn has a separate contract module and tests.

| Card                       | Runtime behavior                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22001 Thorin Stonehelm     | Reuses the collector response after attacker declaration. Its controller optionally discards the actual top card of their deck and deals one damage to an eligible enemy engaged with them.                                                                                                                                                              |
| 22002 Soldier of Gondor    | Reuses the Gondor entry response: search only the original top five, take one qualifying ally or any number at threat 40+, then shuffle.                                                                                                                                                                                                                 |
| 22003 Pillars of the Kings | Reuses Gondor event handling and cost reduction. Setting threat upward uses the normal threat-raising hooks, including Treacherous Easterling; the actual increase controls the one/four-card draw.                                                                                                                                                      |
| 22004 Cautious Halfling    | Optional entry response privately looks at the top encounter card without revealing, moving or shuffling it. Draws only if that card is not an enemy; an empty deck supplies no response.                                                                                                                                                                |
| 22005 Tom Bombadillo!      | Planning only, requires a controlled Hobbit hero and an available set-aside Tom. The shared victory display prevents a second copy. The physical event enters victory as a cost before event cancellation. Choose an available living player's reserve and shuffle exactly one Tom into the encounter deck.                                              |
| 22006 Durin's Axe          | Unique, Restricted, hero attachment, Guarded (enemy). Reuses the Ered Mithrin guarded search and claim flow with an enemy-only filter. Adds +2 attack and offers one damage to an enemy engaged with its controller after its hero participates in a killing attack.                                                                                     |
| 22007 Charge into Battle   | Quest action after staging. Choose non-unique, non-immune staging enemies and saveable attacker selections. Each attack uses normal attack declaration, exhaustion, responses and damage, with eligible Ranged support. Each enemy can be attacked once by this event; it does not consume the ordinary combat-phase attack.                             |
| 22008 Silver Circlet       | Reuses attachment passives: Spirit hero only, one per hero, Restricted, +2 willpower.                                                                                                                                                                                                                                                                    |
| 22009 Inner Strength       | One per hero, attached only to the hero carrying The One Ring; +1 defense. During that hero's defense, its controller may exhaust their ready Ring and raise threat by one to cancel an actual triggered shadow. Scenario cancellation prohibitions remain in force.                                                                                     |
| 22010 Tom Bombadil         | Encounter reserve only; never a player-deck or playable hand card. Its uncancellable reveal lets the first player choose a player in the current staging area. That player gains the actual revealed ally, ready and committed. A persistent end-of-round effect removes Tom and one Tom Bombadillo! from victory, including when Tom left play earlier. |
| 22024 The Burglar's Turn   | Separate loot-deck contract implementation. A guarded Durin's Axe on contract loot ignores its own Guarded keyword until claimed; ordinary guarded claims retain the Ered claim flow.                                                                                                                                                                    |

## Encounter and ownership rules

Encounter setup follows the currently published Angmar Awakened rule: each player may set aside **up to three copies of each Encounter design**, outside the player deck and its minimum size. Explicit smaller allocations and older saves remain valid. The original MEC78 insert used a combined-three limit; it is superseded here by the publisher's later wording.

Tom Bombadillo! can use another player's set-aside Tom. Its event owner remains recorded while the physical event is in the shared victory display, so later removal goes to that owner's removed zone. The reserve selection consumes only the chosen player's count. Reserve counts are public; hidden encounter order and private look-card identities are absent from public state.

An Encounter card dealt as a shadow has no When Revealed effect and is discarded to the encounter discard after the attack. Once Tom is in play, any departure removes him from the game under the Encounter keyword. The delayed removal of Tom Bombadillo! remains scheduled even if Tom has already gone. Round-end processing runs once globally and finds his actual controller across separated staging areas.

The revealed Tom has already entered play before the player gains control of him. This control change is allowed with Fellowship side B, whose restriction is on playing or putting allies into play. Tom remains ready while committed, as printed.

## Implementation and verification

`wrath-ruin-player.ts` owns the new printed abilities; `wrath-ruin-player-support.ts` owns stats, card constants, reserve/public projections and metadata validation. The state contains delayed IDs and owner records, not duplicate physical cards. Native engine hooks cover event payment, ally entry, encounter reveal, attack kills, shadows and round end. Existing Guarded, Restricted, immunity, payment, choice-actor and save mechanisms remain authoritative.

Run:

```sh
node --import tsx --test tests/wrath-ruin-player.test.ts
```

The native suite covers all reused designs, optional and private Halfling responses, guarded Axe identity and controller targeting, actual shadow cancellation and its prohibition, saved multiple Charge attacks and Ranged support, paid-event cancellation, teammate reserves, native staging reveals, Encounter shadows, full PLAY/COMMIT/NEXT Tom lifecycle, early departure and separated-area cleanup. Shared integration and browser suites additionally exercise scenario interactions and visible decisions.

## Sources

- Original card faces and MEC78 pack insert: [Wrath and Ruin source record](WRATH-RUIN-SOURCES.md), with original-printing UUIDs and downloaded-file hashes.
- Publisher's current Encounter wording: [Angmar Awakened Hero Expansion, MEC107 rules, printed page 2](https://images-cdn.fantasyflightgames.com/filer_public/30/2e/302e7c1c-216d-401a-9519-4509d58554e8/mec107_rules.pdf).
- Tom Bombadillo! teammate reserve clarification: [designer correspondence 3.325 reproduced in the ALeP compilation](https://alongextendedparty.com/semi-official-errata-faq-1-10/). This is community-reproduced designer correspondence, distinguished from the publisher rulebooks above.
