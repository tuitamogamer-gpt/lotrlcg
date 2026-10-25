# The River Running

The original **A Shadow in the East** adventure is available in standard and easy modes, for classic solo and one to four hot-seat players. It uses the original `Q09.1` and `E09.1` inventories and the printed difficulty of 6. See [the source audit](SHADOW-EAST-SOURCES.md) for the original insert, all card faces and scoped transcription corrections.

## Setup and physical cards

The normal encounter pool contains **38 cards**, and easy mode **28**; the two main quest cards are separate. The upstream recipe's four staged enemy entries are part of the physical pool, not four mandatory enemies for every player count. Setup stages Easterling Pursuit and one River Running, sets the actual Warriors of the East aside, then lets each player choose a different Easterling enemy from the full encounter inventory. Unchosen cards remain in the shuffled encounter deck.

Saved choices retain their player, original physical cards and search targets. Enemy entry reactions also work when an enemy enters through a player effect. Returning an existing enemy to staging preserves its identity and does not repeat an enters-play trigger.

## Quest and pursuit

Chased by Easterlings has **5 + 5 per player** quest points and adds the Pursuit resource count to total staging threat. At the end of each round, Pursuit gains one resource. If it then has at least three, it removes exactly three, shuffles the encounter discard pile into the deck, discards until one enemy per player is found, and adds those physical enemies to staging. It stops when the deck runs out, and does not loop for additional groups of three resources. When a mounted enemy would also return at round end, the first player chooses the order of those simultaneous forced effects; this preserves the choice of which enemy reaches a staged Trap first.

Advancing puts the set-aside Warriors of the East into play without triggering Surge. The Crossing of Araw has **15** quest points and lowers staged enemies' engagement costs by 10. While any player is engaged, all progress sources share a maximum of five progress placed on that stage per round. Progress already placed before engagement counts toward that limit; side-quest progress remains independent. Defeating the stage wins through the ordinary quest-defeat response window.

## Encounter rules

- Easterling attachments retain physical identities through searches, saved target choices and removal. A revealed attachment waits in a separate resolving zone, so an empty encounter deck cannot reshuffle it before its attachment choice resolves.
- Easterling Raider, Rider of Rhûn, Captain, Warrior, Sword, Bow and Horse have their printed stat modifiers, Archery, search, damage replacement, attack and return-to-staging timing. Forced attachment effects can attach additional copies when their text does not impose a limit.
- Warriors of the East reacts to actual Easterling entry and attacks the first player with a highest-attack staged Easterling when selected as the current quest. Its printed quest goal is eight and its Victory value is ten.
- Rolling Plains and Weary Lands stack lasting effects through the current phase and recalculate which cards qualify. Painful Fatigue may choose an already exhausted character: exhaustion is an effect rather than a cost, and its independent damage still applies. Its shadow returns the enemy **after** its attack.
- River Running blocks optional engagement and requires the first player to engage a highest-engagement staged enemy to travel. Rocky Outcrop blocks readiness from player effects, while permitting framework and encounter readiness. Exposed Riverbank adds Pursuit for its travel cost and for canceled When Revealed effects.
- An Arduous Journey limits each player to six distinct characters readied during refresh while the side quest is in play. Each player chooses which characters to ready, including saved Caught in a Web payments. Its optional defeat responses let each player ready a hero. Its printed goal is six and Victory value ten.
- Outrider's attachment-discard shadow uses the attachment's controller, including attachments on enemy, location, quest and threat-dial hosts, while preserving its physical owner. The One Ring is immune to that effect. Stacked Enemies Close Behind shadows independently add Pursuit when their attack destroys a character.

## Verification

`node --import tsx --test tests/river-running.test.ts` exercises setup inventories, both difficulties and all player counts, classic/guided saves, travel and cross-seat choices, the progress cap and victory, pursuit depletion, attachment searches and identity, entry-versus-return timing, Archery, phase expiry, damage cancellation and refresh choices.

The complete-game driver is selected with:

```sh
SHADOW_EAST_SIMULATION_SCENARIO=the-river-running \
  node --import tsx --test tests/shadow-east-simulation.test.ts
```

It runs normal/easy one-to-four-player games and compares the three two-player event-review modes, including restoration after actual actions, physical conservation, public privacy and pure rendering. A completed seeded game can be a loss; the focused victory fixture verifies the printed winning path separately.

The 25 October 2026 release verification passed **51 focused tests** and the final **14 complete seeded games**, with **1,688 actual actions and exact save restorations**, **six review-mode comparisons**, **644 physical/identity/render boundaries**, and **1,701 public-privacy comparisons**. All fourteen seeded games ended in losses; the focused actual-progress fixture separately verifies the printed victory. The final matrix includes the saved Horse/Pursuit ordering choice and the physical attachment resolving zone.
