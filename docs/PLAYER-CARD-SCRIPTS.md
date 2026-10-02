# Exact expansion player scripts

The reference catalog and the gameplay registry are separate. Catalog import does
not grant a card automated support. The fixed fixtures below register only cards
whose printed abilities have implementations and focused integration tests.

- `hunt-player-support.ts`: every player card from **The Hunt for Gollum**,
  `02001`–`02010`.
- `carrock-player-support.ts`: every player card from **Conflict at the Carrock**,
  `02025`–`02034`.
- `rhosgobel-player-support.ts`: every player card from **A Journey to Rhosgobel**,
  `02050`–`02059`. Imrahil and Haldir reuse their existing exact registrations;
  this block adds the other eight identities.
- `emyn-player-support.ts`: every player card from **The Hills of Emyn Muil**,
  `02072`–`02081`.
- `marsh-player-support.ts`: every player card from **The Dead Marshes**,
  `02095`–`02104`.
- `mirkwood-player-support.ts`: every player card from **Return to Mirkwood**,
  `02116`–`02125`. Dáin reuses the verified Dwarf passive.
  All six Shadows of Mirkwood adventure packs now have their complete player sets.
- `khazad-player-support.ts`: all thirteen player designs from **Khazad-dûm**,
  `03001`–`03013`, including the previously verified Dwarf actions and Boots.
- `redhorn-player-support.ts`: all ten designs from **The Redhorn Gate**,
  `04001`–`04010`.
- `road-player-support.ts`: all ten designs from **Road to Rivendell**,
  `04028`–`04037`, including the existing Dwarf and Rivendell Blade rules.
- `watcher-player-support.ts`: all ten designs from **The Watcher in the Water**,
  `04053`–`04062`, reusing the reviewed Sword, Counsel, Legacy and Resourceful rules.
- `long-dark-player-support.ts`: all ten player designs from **The Long Dark**,
  `04076`–`04085`, including the reviewed Ring Mail passive.
- `foundations-player-support.ts`: all ten designs from **Foundations of Stone**,
  `04101`–`04110`, including the shared Dwarf, Elf and attachment rules.
- `shadow-flame-player-support.ts`: all ten designs from **Shadow and Flame**,
  `04128`–`04137`, including the shared We Are Not Idle and Hardy Leadership rules.
  Every player design in the six Dwarrowdelf adventure packs is registered.
- `heirs-player-support.ts`: all eighteen designs from **Heirs of Númenor**,
  `05001`–`05018`, including the six existing verified Gondor registrations.
- `steward-player-support.ts`: all ten designs from **The Steward's Fear**,
  `06001`–`06010`, including the shared Shield and Ring rules.
- `druadan-player-support.ts`: all ten designs from **The Drúadan Forest**,
  `06032`–`06041`.
- `amon-din-player-support.ts`: all ten designs from **Encounter at Amon Dîn**,
  `06056`–`06065`.
- `gondor-player-support.ts`: sixteen additional identities needed by the exact
  **Defenders of Gondor** preconstructed deck. Together with the original Core
  scripts and reviewed passive registrations, all three heroes and all 50 cards
  in that published main deck can be used. The product's optional sideboard is
  separate and is not covered by this claim.

The original four 30-card Core starter recipes remain unchanged. Imported
reprints use the canonical identity's existing rules; importing another printing
never creates a new rule implementation.

## Timing and multiplayer

`expansion-player-cards.ts` implements actions and responses for the first two
adventure packs. Searches preserve the original searched boundary while players
select multiple copies, then shuffle the remaining deck with the game's seeded
random generator. Minstrel searches only after a hand play; Soldier of Gondor
searches after any entry. Responses are optional; Forced effects are mandatory.

Bilbo adds to the first player's resource-phase draw, independent of his owner.
Winged Guardian's fee is paid from its controller's Tactics hero pool after the
defended attack. Strider's Path bypasses Travel costs, but shares the ordinary
after-travel effects and keeps the current phase. Frodo's damage decision occurs
before lethal damage is finalized; accepting resumes the ordinary consequences,
and cancellation consumes his phase limit and raises his controller's threat.

`gondor-player-cards.ts` handles entry, leave-play, engagement, resource-gain and
attack-kill response windows. Resource transfer conserves the total resources
and can cross players. Heir of Mardil responds to resources gained through card
effects, including moved resources, while framework collection does not trigger
it. Captain's bonus and Imrahil's limit last the round; Mablung's limit lasts the
phase. Foe-hammer checks the attacking hero's controller and an eligible ready
Weapon, and can resolve multiple copies using different Weapons. Behind Strong
Walls receives explicit combat action windows before shadows and damage.

Text blanking suppresses the relevant abilities and traits. Sacked heroes retain
their existing resource pools and may donate or spend resources, but cannot gain
new ones. These interactions use the same hooks as the original Core cards.

`rhosgobel-player-cards.ts` distinguishes destruction from ordinary discard and
return. Landroval returns a surviving player's destroyed hero with fresh tokens,
one damage and no old attachments; its once-per-game limit belongs to the player
who used it. Losing the last hero eliminates that player immediately. To the
Eyrie pays its event cost and exhausts an Eagle controlled by its player, then
returns the destroyed ally to its owner's hand. A physical destruction cannot
rescue an older same-title card a second time.

Ancient Mathom responds after exploration and draws for the first player,
including when the explored location had blocked drawing. Escort's Forced
discard follows quest resolution for success, failure and ties. Its commitment
test follows the Rules Reference's definition that a character removed from a
quest ceases to be committed; this is a rules interpretation, not an
Escort-specific FAQ ruling. Infighting moves damage tokens before checking for
destruction and does not count as an attack kill or damage dealt.

Radagast's resource pool pays Creature cards played from hand, but cannot pay
Winged Guardian's after-defense Tactics fee. His repeatable healing action does
not exhaust him and may target any damaged Creature, including an enemy. It
shares Wilyador's healing lock, five-damage cap and stage-two source removal with
the original Core healers.

`emyn-player-cards.ts` follows Brand's FAQ-confirmed response to participating in
another player's attack. It captures the defeated enemy's engagement before the
enemy leaves play. Thorondor responds to entry and any leave-play method. Took's
deck discard uses the shared mining response hook. Gildor swaps and orders only
the original viewed cards, including a deck shorter than three cards. Counsel
must precede the commitment step, including an empty commitment, and cannot
reduce staging below one or create a reveal from a zero-card step. Extra
encounter reveals and Surge keep their ordinary behavior.

`marsh-player-cards.ts` gives Boromir his errata's once-per-phase readying limit.
Vassal's Forced discard occurs after every attack it participated in. Watcher
cancels a shadow without exhausting or paying resources. Song of Mocking stores
its phase-long replacement in resolution order, so the most recent matching
replacement wins; each assignment is visited once to terminate redirection
chains. The final recipient receives the ordinary damage, Frodo decision and
combat consequences. This uses the Rules Reference replacement rules rather
than a Song-specific FAQ ruling.
Hill Troll's excess threat remains with the defending player even if a different
player's hero receives the damage through Sentinel or Song of Mocking.

Elfhelm responds to a failed quest or a positive encounter/quest card effect,
including Doomed and Hill Troll excess threat. Framework refresh and card costs
do not qualify. Silvan Tracker responds to an actual exhausted-to-ready change
during refresh, including card effects, and its optional healing can cross
players. Fast Hitch, ordinary readying and We Do Not Sleep use the same shared
ready/commitment hooks.

`mirkwood-player-cards.ts` enforces Dawn's dealt-but-face-down shadows and
before-any-resolved-attack timing, including queued shadow resolution. Each player
may discard one shadow from an enemy engaged with that player without looking.
Eagles of the Misty Mountains consumes the exact departed physical Eagle from
its discard, hand, deck or removed destination. Face-down attachments retain
ownership for later discard, with no printed abilities, and share a physical
consumption guard with To the Eyrie and Landroval.

Support of the Eagles adds the chosen ally's current attack or defense for the
phase. The bonus survives the ally or attachment leaving, as described in
[FFG's Return to Mirkwood preview](https://www.fantasyflightgames.com/en/ffg_blog/21918/original_content).
The snapshot treatment of later ally stat changes follows the Rules Reference's
lasting-effect rules; it is not a Support-specific FAQ claim. West Road Traveller
switches locations without travel costs or travel responses. With multiple active
locations the first player chooses one to switch; Strider's Path likewise replaces
one chosen active location while retaining its normal after-travel effects.
Mirkwood Runner ignores defense only while attacking alone. Rumour looks without
revealing and pays its optional return cost separately. Shadow of the Past moves
only the top encounter discard without revealing it.

`khazad-player-cards.ts` treats Veteran's entry damage as an initial counter,
not dealt damage. Zigil names before revealing any deck card, discards through
the shared mining hook, treats X as zero outside play, and gains one resource per
matching discarded card, including a one-card deck. Sacked heroes cannot receive
those resources. Dwarrowdelf Axe's damage is a separate after-attack effect and
cannot trigger attack-kill reactions such as Dwalin or Foe-hammer. Ever Onward
chooses its protected player before unsuccessful-quest threat is raised; an
increment that was prevented cannot trigger Elfhelm. These entry and timing
applications use the printed rules and Rules Reference; Zigil's wording also
follows its explicit FAQ erratum. Multi-active-location bonuses inspect all
active locations; Ancestral Knowledge chooses one active location for progress.
Astonishing Speed, Untroubled by Darkness and We Do Not Sleep snapshot their
eligible characters when played. They do not affect later entrants or characters
that only later gain the qualifying trait (Rules Reference, Lasting Effects).

`redhorn-player-cards.ts` handles the twins’ separate declaration responses and
passive stat bonuses. Keeping Count compares the highest difference against one
other physical copy, rather than summing other copies; this interpretation uses
the printed singular wording and Rules Reference, not a card-specific FAQ.
Bofur's hand Quest Action enters him exhausted and committed without ordinary
hand-play responses, then returns him after a successful quest. Good Meal
snapshots the attached hero's current spheres, including gained resource icons.
Multiple matching Meal discounts stack and are consumed by the next
matching event even if its cost reaches zero. Renewed Friendship requires an
actual attachment play from another player, including a deck play through Vilya;
putting an attachment into play does not trigger it. Taking Initiative and Timely
Aid use only the actual viewed cards; Needful looks without revealing and pays
its threat as a cost. X is zero outside play.

`road-player-cards.ts` keeps Rider's ownership while changing its controller and
shares shadow removal's face-up count. Song of Eärendil is controlled by the
attached hero's controller, including its optional entry draw and threat
responses. The response can follow framework and cost threat increases as well
as card effects. Out of the Wild puts the exact encounter card and resolved
event in the victory display, independently of their numerical victory points.
The End Comes responds to any Dwarf departure, including return to hand. Hail of
Stones pays with ready controlled characters and uses the shared exhaustion
hook. Sacked prevents the specified actions, resource collection and triggering the
hero’s own effects. It does not blank printed text or prevent another card from
exhausting the hero as a cost. Constant effects and spending existing resources
remain available.

`watcher-player-cards.ts` records Aragorn's once-per-game limit for each player
and resets to that player's original starting threat, including legacy saves
whose original hero identities remain available. Grave Cairn captures attack
before a departing character loses attachments, and multiple events can respond
to the same departure. Its boosts, and Arwen's defense and Sentinel, last through
phase boundaries until the end of the round. Arwen responds to actual exhaustion
from commitment, defense and card costs, but not to entering already exhausted.
Watcher of the Bruinen's Forced effect belongs to the defending ally's
controller, follows the completed attack, and its discard is distinct from
destruction. Rivendell Bow grants Ranged to each eligible character and gives its
extra attack only to a character with printed Ranged during an attack against
another player's engaged enemy. Short Cut pays with a controlled ready Hobbit,
shuffles the entered location without travel or exploration effects, and reveals
a normal replacement card; removing one of multiple active locations preserves
the others.

`long-dark-player-cards.ts` keeps Háma's three-use ledger for the entire group
throughout the game. Erestor discards before drawing and does not exhaust. Fresh
Tracks responds to any actual staging addition, including an enemy returning
from engagement, and affects framework engagement checks rather than optional
engagement. Multiple copies can respond to the same addition. Erebor Battle
Master counts other controlled Dwarf allies and obeys the errata's +4 cap.
Out of Sight snapshots the enemies currently engaged and prevents their attacks
against the chosen player for the phase. Ever My Heart Rises requires actual
travel to a qualifying location. Warden selects up to two different healable
characters, then may pay two Lore resources to ready if still in play. Its
initiation needs an actual damaged character, applying the Rules Reference's
potential-change rule; this is not a Warden-specific FAQ. Its Wilyador heal uses
the shared cap and stage-two removal. Word of Command exhausts a controlled
Istari and searches the whole deck without drawing. Love of Tales responds to
actual Song plays by any player, exhausts the attachment, and respects Sacked
and attachment control. Sphere-icon attachment restrictions include spheres
granted to heroes by resource icons: the original Core rules, page 8, explicitly
identify these icons with the spheres to which the hero itself belongs. See the
[official original Core rules](https://images-cdn.fantasyflightgames.com/ffg_content/lotr-lcg/support/LOTR_LCG_Core_rules_eng_Lo-Res.pdf).

`foundations-player-cards.ts` distinguishes actual exhaustion to commit from
exhaustion for a different cost. Spirit Glorfindel's Forced threat therefore
triggers for an Avalanche commitment, but not for a no-exhaust commitment with
Light of Valinor. Trollshaw Scout does not exhaust for an ordinary declaration;
its after-attack discard belongs to its controller and is not destruction.
An event that explicitly exhausts the Scout still pays that cost. Stargazer
orders the exact top five of the chosen player's deck, preserving duplicates
and the unviewed tail. Heavy Stroke uses one Dwarf's share of combined attack
damage: the chosen positive share is bounded by that Dwarf's attack power and
the other attackers' contributions. This allocation is a Rules Reference
interpretation, not a published card-specific ruling. The extra damage is a
separate card effect; a kill solely from it does not trigger attack-kill
responses. Its printed per-phase limit follows the official Rules Reference's
per-ability-instance rule rather than a community group-wide proposed erratum.
Distinct event copies may respond separately. The physical event identity is
preserved through Háma's discard recovery and the shared player-deck movement
helpers. A focused test also recycles the used copy through Will of the West,
searches it with Word of Command, then performs another Hands Upon the Bow
attack in the same phase; the recovered copy remains unavailable.

`shadow-flame-player-cards.ts` gives Elrond permission to pay for other-sphere
allies without granting those resource icons. His healing response follows
actual healing by another card, cannot recurse on itself, and observes Wilyador's
per-effect cap and stage-two healer removal. Miruvor discards as its cost and
chooses two different benefits; it can act while the attachment is exhausted.
Its willpower lasts through the round, and its physical return goes to its
owner's deck while other benefits affect the host's controller. Master of the
Forge searches the original top five and adds an attachment without drawing.
Peace, and Thought requires a Refresh Action and two different controlled heroes
able to exhaust. Risk Some Light optionally bottoms one original viewed card,
then orders only the remaining viewed cards without revealing them.

Hands Upon the Bow exhausts its controlled Ranged character as an explicit cost
and declares an extra staging attack with +1 attack only for that attack. It
does not consume the normal attack allowance, and cannot target immune enemies
(FAQ section 1.47). A Elbereth responds to a real non-unique enemy attack against
the original defending player, independently of Sentinel defense. It returns
the surviving enemy to the encounter deck without defeat or victory effects;
its threat adjustment is a player-card effect. Feint, Forest Snare and other
attack-prevention effects do not count as attacks for this response.

Vilya uses a trusted top-deck resolution path. Free PLAY skips the cost and
resource match (the explicit FAQ ruling) while preserving printed phase,
response, uniqueness, target and PLAY restrictions. Its separate put-into-play
choice accepts only allies and attachments with a valid destination; it does
not trigger PLAY responses or count toward Dol Guldur's ally PLAY limit. A deck
PLAY can trigger Erebor Hammersmith and Renewed Friendship, but not hand-only
Minstrel, Traveller, Legacy of Durin or Glóin responses. Printed X is zero at no
cost: Stand and Fight cannot select a positive-cost ally, and Gandalf's Search
with X zero cannot change the game state. Pending revealed-card and attachment
target choices survive save and reload.

`heirs-player-cards.ts` adds target-aware Beregond reductions, including the
actual selected host during payment. Mutual Accord snapshots existing Gondor
and Rohan cards, including attachments, and its lasting traits survive printed
text blanking. Light the Beacons similarly snapshots existing characters and
lasts until round end; defenders still need to be ready and legally able to
exhaust. Blood of Númenor pays first and retains the resulting defense bonus
until phase end, with a separate limit for each physical attachment. Damrod's
discard is a cost rather than destruction. Wealth of Gondor respects Sacked
and triggers resource-gain responses on the chosen hero's controller.

Hunter of Lamedon triggers only after a hand PLAY, reveals the actual top card,
and adds Outlands cards without drawing; other revealed cards use the common
deck-discard path and its responses. Master of Lore applies the current FAQ's
next-card erratum with a minimum cost of one, never raises a zero cost, and is
consumed by actual free PLAY as well as ordinary PLAY. Put-into-play preserves
that pending discount. Tracker's pending next enemy includes actual returns to
staging and is consumed even by an immune enemy; its zero staging contribution
persists through other modifier changes until phase end.

Ranger Spikes starts unattached in staging and automatically attaches before
optional entry responses. An immune enemy is ineligible. Several unattached
copies can attach to the same entry. Attached Spikes modifies threat and blocks
framework engagement checks while permitting optional engagement. Amon Lhaw
blanks both unattached and attached copies. Spear of the Citadel offers its
optional defender-declaration damage before shadow resolution. A Watchful
Peace uses the explored location's physical discard occurrence and only offers
for a zero-victory location that actually entered the encounter discard.
Vilya can PLAY Spikes into staging; its generic PUT option cannot supply the
special staging destination specified by Spikes' PLAY instruction. This follows
the Rules Reference's distinction between play instructions and put-into-play.

`steward-player-cards.ts` applies each Outlands aura continuously to its
controller's characters, including the source. Copies stack and removing
Herdsman's hit-point bonus can immediately destroy damaged characters. Hirluin
allows positive-cost Outlands ally payment from his existing resource pool;
Sacked blocks his triggered abilities but does not erase that constant
permission. Gaining Strength pays by discarding two resources before adding
three to the same controlled hero. Mithrandir's Advice counts printed Lore
icons. Good Harvest gives its player a named-sphere spending permission through
phase end, rather than a resource icon.

Good Harvest's explicit FAQ answer preserves resource matching for zero-cost
cards. The same outcome for Elrond and Hirluin follows the original Core rules
and Rules Reference requirement for a matching icon at zero cost, together with
their permission to spend resources rather than grant icons. That application
is a general-rule interpretation, not an Elrond- or Hirluin-specific FAQ ruling.
Vilya's explicit no-cost PLAY permission remains distinct.

`druadan-player-cards.ts` reduces starting threat for every printed Lore hero
controlled alongside Mirlonde, including herself. Forlong readies at the start
of all seven real phases, including the separate Resource and Planning action
windows. Quest staging and player attacks are steps within their existing
phases. His four-sphere condition counts controlled Outlands allies, including
himself. Strength of Arms readies eligible allies across the table while its
play restriction requires printed Leadership icons on the player's heroes.

Mighty Prowess responds only to an actual attack kill, including ranged
participation in another player's attack; eligible enemies share a captured
trait of the destroyed enemy. Silvan Refugee's Forced discard follows character
departures across the table, including another player's elimination, and is
not destruction. Harbor Master offers one optional defense increase per
positive card-effect resource-gain occurrence, independent of the amount;
copies react separately and the increases last until round end.

Trained for War uses its FAQ erratum and the physical current quest; advancing
does not transfer its lasting Battle keyword. Against the Shadow snapshots
existing Spirit characters and substitutes their current willpower whenever
defense is used, including Siege questing. Defense-only bonuses and reductions
do not modify that substituted willpower. These snapshot and substitution
applications use the Rules Reference, not a card-specific FAQ ruling.
Advance Warning prohibits engagement checks this phase, including newly added
enemies, while optional and card-effect engagement remain legal. White Tower
Watchman can receive all damage from an undefended attack while exhausted when
his controller's heroes share a sphere; gained resource icons can establish
that shared sphere.

`amon-din-player-cards.ts` implements Pippin's optional engagement response when
every controlled hero is a Hobbit. Its threat cost is paid before returning the
enemy, and that physical enemy cannot engage Pippin's player again that round.
Other players can still engage it, including through Road to Rivendell's Ambush.
Denethor counts his controller's damaged heroes, tests his modified willpower,
and is discarded rather than destroyed when that value reaches zero.
Lord of Morthond requires printed Leadership hero icons and responds to an ally
being played, including from a deck; putting an ally into play does not qualify.

Book of Eldacar counts printed Tactics icons for its play discount. Its action
offers a legal discarded Tactics event, targets and an explicit normal resource
payment before discarding the Book. The selected physical event remains outside
the discard pile throughout its effects, including Quick Strike's nested Háma
response, then goes to the deck bottom. Saved choices retain that physical copy;
another identical discarded event remains independently available. Counter-Spell
preserves the Book and resource costs and still sends the canceled replay to the
deck bottom.

Gondorian Discipline offers cancellation before lethal damage and replacement
effects, with an explicit choice of one or two damage to cancel. Another player's
copy may respond to damage left pending after a canceled copy. Declining preserves
the damage source and cancellation flags through Song of Mocking, Dori and Frodo;
actual combat damage and its consequences use the reduced amount placed.
Minas Tirith Lampwright responds to a revealed card with Surge and names the
next reveal's type. A matching next card is discarded before its keywords or
revealed effects; a mismatch consumes the prediction and resolves normally.

Small Target requires a Hobbit hero to actually exhaust to defend. It reveals
the attacking enemy's physical shadow early, resolves a printed shadow effect
once if present, or redirects a shadowless attack to another enemy engaged with
that player. Ithilien Archer offers its return response only after an attack
actually damages a surviving eligible enemy, including ranged participation.
Ithilien Pit enters staging unattached and attaches to the next eligible enemy
entry; ordinary ready characters may then attack that enemy in staging. Automatic
Pit attachment is a put-into-play effect, so Durin's Bane's prohibition on playing
attachments does not prevent it. Hobbit-sense snapshots the player's engaged
enemies and prevents that player's attack declarations through round end.

All thirteen response-event paths in the earlier modules respect Counter-Spell's
cancellation result. Resource and additional costs remain paid, while canceled
effects create no damage, movement, draw, readying or lasting grants. Short Cut
retains its Hobbit exhaustion cost and Foe-hammer retains its Weapon exhaustion.
Heavy Stroke consumes its physical copy's phase limit before cancellation;
the binding survives even when Counter-Spell discards another printed copy.

The shared event lifecycle follows the Rules Reference's **Event Cards** entry:
pay the costs, resolve the ability, then place the physical event in its owner's
discard pile. A resolving event is kept outside the hand and discard until its
queued effects and choices finish; saved games preserve that copy and its owner.
This prevents Háma or another discard search from recovering an event while its
own attack or response is still resolving. Counter-Spell cancellation still
finishes that lifecycle after preserving the paid costs. A card that removes
itself from the game changes its own final destination, rather than removing
another printed copy already in the discard pile. Book of Eldacar's discard
replay retains legal timing, targets and normal resource payment, then sends
that resolving copy to the bottom of its owner's deck.
Rumour from the Earth can return that same held copy to its owner's hand,
preserving its physical identity. Out of the Wild sends its held copy to the
victory display. Neither effect substitutes an older identical discarded card.

Engaged-enemy scopes also include Durin's Bane when its printed text considers
it engaged with that player. Boromir, Out of Sight, Rider of the Mark and Dawn
Take You All inspect that virtual engagement without duplicating or moving the
physical staging card. Out of Sight protects only its own player; shadow-card
effects operate on the actual dealt shadows. Threat-zero players do not gain
these considered-engagement targets. Global all-enemy scans retain physical
identity, and movement effects honor Bane's prohibition on leaving staging.

## Verification and sources

Run the focused checks with:

```sh
node --import tsx --test tests/hunt-player-cards.test.ts tests/carrock-player-cards.test.ts tests/gondor-player-cards.test.ts tests/rhosgobel-player-cards.test.ts tests/emyn-player-cards.test.ts tests/marsh-player-cards.test.ts tests/mirkwood-player-cards.test.ts tests/khazad-player-cards.test.ts tests/redhorn-player-cards.test.ts tests/road-player-cards.test.ts tests/watcher-player-cards.test.ts tests/long-dark-player-cards.test.ts tests/foundations-player-cards.test.ts tests/shadow-flame-player-cards.test.ts tests/heirs-player-cards.test.ts tests/steward-player-cards.test.ts tests/druadan-player-cards.test.ts tests/player-event-cancellation.test.ts tests/rhosgobel.test.ts tests/dead-marshes.test.ts
node --import tsx --test tests/amon-din-player-cards.test.ts
npm run check
```

The card fixtures retain the printed rules and source links from the reviewed
RingsDB/DragnCards reference snapshot. Gameplay timing and resource terminology
follow [FFG's rules and supporting documents](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/),
including [FAQ section 1.25](https://images-cdn.fantasyflightgames.com/ffg_content/lotr-lcg/support/LotR-FAQ.pdf).
Destruction, commitment and elimination timing also follow the official
[Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf).
The exact Gondor deck is the main recipe in
[`mec105_rules.pdf`](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec105_rules.pdf).

This documents the implemented blocks, not a claim that every imported expansion
or scenario is automated. The gameplay registry and coverage audit remain the
authority for other identities.
