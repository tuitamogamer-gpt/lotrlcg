# The Sands of Harad — original rules notes

The runtime uses the original MEC55 deluxe expansion and its three original
standard/easy scenarios for one to four local players. The publisher's rulebook,
original card scans, immutable source pins and corrected physical inventories
are recorded in `HARAD-SOURCES.md`. The notes below distinguish printed rules
from interpretations that have no identified scenario-specific designer ruling.

## Escape from Umbar

Build the original Escape from Umbar, Harad Soldiers and Harad Territory sets.
Add “Seize them!” to staging. Each player chooses a different location and begins
engaged with an Umbar Sentry. Return unused setup candidates to the same physical
encounter deck and shuffle. Standard has five physical Sentries; easy has four.

Both quests have 15 quest points and cannot hold more than 15 progress. Neither
stage can be defeated while any player is engaged with an enemy. “Seize them!”
removes progress after an attacking enemy destroys a character, using that
attacking enemy's threat. At the end of a round, it causes a loss only if the
main quest was in play for that entire round and has zero progress. Advancing to
a new quest during a round therefore matters to this check.

Flee the City 2A ends the current phase before shuffling the encounter discard
into its deck. In player order, each player discards until an enemy and puts that
physical enemy into play engaged with them. These enemies are put into play,
not revealed. At the beginning of each later quest phase, if any player lacks an
engaged enemy, stage 2B discards until an enemy and adds it to staging.

Southron Champion's resource marks a particular physical Harad enemy. Its stage
adds +2 threat, attack and defense and immunity to player card effects. The
Champion cannot take damage until the side quest has four progress, and neither
that side quest nor the main quest can be defeated while the Champion remains
in play. Southron Soldier's shadow can engage only a **non-unique** enemy.

Narrow Alleyway's optional Response puts one engaged non-unique enemy beneath
the active location, out of play. Its Forced departure returns the physical
enemy engaged with the first player. Port of Harad counts all engaged enemies
for both threat and its group damage travel cost. In Enemy Territory immediately
restricts each player's hand to five cards while it remains in play; its printed
defeat Response draws one card per player. Enfeebled's reveal and shadow
restrictions have different printed durations.

## Desert Crossing

Build Desert Crossing, Desert Creatures and Desert Sands. Each player stages one
physical Burnt Sands and the remaining copies return to the encounter deck.
Temperature begins at **10**. The heat tracker is a separate counter; it is not
any player's threat. The publisher says the players lose when it reaches **60**,
so every temperature increase must check that threshold immediately.

The tens digit means the integer quotient of temperature divided by ten. It
sets all three Were-worm combat/staging stats, Scorched Hamada's threat and
travel damage, Unbearable Heat's damage and shadow bonus, and Seek Shade's
end-of-round progress removal. Were-worm has no printed Victory value. A search
of the victory display on stage 3A remains meaningful if a player card previously
moved a Were-worm there.

The first quest has eight points and gives each entering ally an exhaust-or-one-
damage choice. The second has fourteen points; its end-of-round effect increases
temperature by four **then** assigns damage using the new tens digit. The final
quest has sixteen points, adds the tens digit as staging threat during the quest
phase and cannot be defeated while a Were-worm remains in play. Stages 2A and
3A each increase temperature by two; stage 3 searches one Were-worm per player
from the encounter deck, discard and victory display if able.

The heat and side quest effects are separate simultaneous triggers; first-player
ordering applies within the usual Forced-effect timing. A readying restriction
from Find Water applies to player card effects, including player-card readying
Responses, and does not prohibit framework refresh. Heat Exhaustion's reveal
instruction is not an exhaust cost: it deals its printed damage even if the
selected character is already exhausted. Conversely an exhaust-or-damage choice
cannot select an impossible exhaustion branch merely to avoid damage. These
follow the ordinary effect/cost distinction; no Desert-specific designer ruling
was identified for these cases.

## The Long Arm of Mordor

Build The Long Arm of Mordor, Mordor Orcs and Jungle Forest. Set Uruk Chieftain
aside and stage one physical Sauron's Enforcers per player. Starting heroes move
to staging. In first-player order, each player chooses a different objective-hero
and adds two resources to its pool; unused objective-heroes leave the game.

MEC55 page 9 defines an objective-hero as both an objective and a neutral hero.
It has no threat cost, does not count against the three-hero limit, collects a
resource during each resource phase, and can pay for neutral player cards.
Its printed controller-elimination sentence cannot be modified in any way.
As an original encounter card, an objective-hero's own ability is an encounter
card effect; control by a player does not turn it into a player card effect.

Staged starting heroes are in play without a controller, immune to player card
effects, and blank. They collect no resources. Their owner remains the player
who chose them during setup. A staged hero reduced to zero hit points is
destroyed and enters its original owner's discard pile. Taking control returns
that physical hero to its player's area and ends the staging restrictions.

Surprise Attack 1B has no numeric quest threshold. Undefended attack damage must
hit a staged hero if able, and each player's first card played each phase needs
no resource match. Its Forced recovery occurs only after successful questing
places progress **on this stage**, not merely after questing successfully. An
active location or a selected side quest can therefore delay the recovery. Each
player chooses an owned staged hero, takes control exhausted, then stage 2A
becomes active. Find the Others has five points, preserves those two passive
rules and recovers another owned staged hero upon defeat.

Free the Captives 3A searches one Orc per player, then attaches each remaining
staged hero to a different Orc in staging. The printed rulebook treats such a
hero as a guarded objective. General FAQ §1.23 changes an attached non-objective
card's original type to attachment; guarded ordinary heroes are consequently
not ordinary character targets while attached. This is the general FAQ applied
to the printed scenario instruction, not a separate designer ruling. Each guard
gains +1 threat, attack and defense and immunity to player card effects. Its
actual defeat restores the guarded hero exhausted to that hero's owner.

Escape into the Jungle 4A adds the set-aside Chieftain, shuffles discard into the
encounter deck and reveals one card per player. Stage 4 has fifteen points,
prevents non-combat damage to the Chieftain, reduces non-unique Orc engagement
costs by ten and gives the Chieftain an immediate attack after engagement.
The quest cannot be defeated while he is in play. The Chieftain has no printed
Victory value, cannot be optionally engaged or have player attachments, and
cannot take damage while his engaged player also has another Orc engaged.

Sauron's Enforcers and Southron Boma use the **main quest's** stage number even
when questing against a side quest. Mordor Warg is a physical Mount attachment
while attached, returns its host to staging when revealed, and reappears as the
same physical enemy when its host leaves play. Searches and additions do not
resolve When Revealed text unless the effect explicitly says to reveal.

## Player design interpretations

Gimli and Legolas retain the wording of their original partner Responses.
Their independent stat bonus is not written after “then”; an exhausted or
already ready partner is evaluated using that wording and ordinary ability
resolution rules. Dwarven Shield refers to damage from an enemy attack, meaning
combat attack damage rather than unrelated direct damage dealt by a shadow
ability. No named Harad-specific designer clarification was located for these
interactions; implementation and tests should identify them as printed-text
interpretations rather than quote an invented ruling.

The Storm Comes has “Limit 1 copy of The Storm Comes in the victory display.”
MEC55 page 2 explicitly permits defeating another copy and then puts that
just-defeated copy in its owner's discard pile if one is already in victory.
The restriction limits entry into the victory display; it does not prevent
playing or choosing another copy as the current quest. Its resource-match exception applies to the first ally played by **each player**
each round; a previously played ally consumes that player's first-ally position.
