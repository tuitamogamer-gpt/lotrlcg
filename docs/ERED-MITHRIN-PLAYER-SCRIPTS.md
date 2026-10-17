# Ered Mithrin: four original player packs

The forty original designs from The Withered Heath (`19001`–`19010`), Roam Across
Rhovanion (`19026`–`19035`), Fire in the Night (`19056`–`19065`), and The Ghost of
Framsburg (`19084`–`19093`) are native player cards. The immutable official catalog
is unchanged. The runtime subset retains its metadata and uses the original
DragnCards UUID scans at `/cards/{code}.jpg`; all forty byte counts, source URLs,
and SHA256 values are pinned in `tests/ered-mithrin-player-art.ts`.

All seven original scan contact sheets were read directly. Runtime wording follows
the scans where the catalog transcription differs: Familiar Lands affects locations
with a **player card** attachment; Ring of Thrór's ability names **Ring of Thrór**.
These corrections do not overwrite the imported source record.

`ered-mithrin-player-support.ts` provides equipment and active-location statistics,
conditional quest exhaustion, cost reductions, phase and round restrictions,
Thalion's hero conversion and side quest resource icons. Squire's Helm, Ancestral
Armor, Warrior Sword, and Valiant Determination retain their existing canonical
passive rules. Wild Stallion retains the physical ally's identity when it becomes a
restricted Mount attachment.

`ered-mithrin-player.ts` provides actions and optional responses with serializable
continuations. Grimbeorn spends his own resource and counterattacks while exhausted;
Dáin discards actual deck cards for the current attack. Skin-changer, Thranduil,
Wiglaf, The Elvenking, Giant Bear, and Soldier of Erebor enforce their printed timing,
costs, and limits. The Hidden Way and South Away! change the active location without
paying a Travel cost. Haldan and Woodmen's Clearing retain exploration snapshots;
Leather Boots responds to actual encounter reveals. Long Lake Fisherman names a
number before choosing among matching cards in the top five.

The Arkenstone, Glamdring, Orcrist, and Ring of Thrór use the original Guarded (X)
rules: discard until an eligible enemy or location is found, add it without
revealing it, and retain the guarded card's physical identity and owner. When the
guard leaves, its controller chooses an eligible character. The Arkenstone transfers
its controller, willpower benefit and threat effects; weapon destruction responses
credit the attachment's controller. Quicker Than Sight returns its Silvan ally as a
cost before shadow cancellation. Swift and Strong exhausts its selected Weapon as
a cost and grants its bonus to the next attack that phase. Outmatched waits in its
controller's play area for an eligible engagement.

Eagle of the North uses a separate Encounter reserve, shared with the existing
three-card Encounter reserve limit. Flight of the Eagles pays the Eagle return,
consumes a reserve card, shuffles it into the encounter deck and removes its own
physical event from the game. Its native reveal assigns control through a first
player decision and offers the optional discard of a non-unique staging enemy.

The focused tests cover every design, original artwork, physical identity, response
costs, limits, reloads, and ownership across one to four players. The browser suite
uses actual Play, ability, defense, choice and resume controls at 1280, 390 and 320
pixels, checks all forty printed faces, verifies served artwork bytes and decoding,
and records the actual loaded production module's HTTP body witness through the
existing browser artifact evidence helper.
