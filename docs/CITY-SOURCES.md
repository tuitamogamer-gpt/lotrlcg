# Original The City of Corsairs sources

Prepared and checked on 15 October 2026. This import covers the original MEC53
Adventure Pack, nine player designs (`12138`–`12146`), and original standard/easy
scenarios (`Q06.9`/`E06.9`). The revised Dream-chaser campaign and Nightmare
versions are separate products.

## Printed rules and immutable input

- [Original MEC53 rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec53_rules.pdf),
  HTTP 200, 605,953 bytes, SHA-256
  `aa72904f75f3953b790c989120facbfacb063c649576bc781edaa04d80d54761`.
  Its original page was rendered and visually checked. Difficulty is **8**.
  The insert explains the sea-to-land transition and the indestructible keyword.
- [Original Grey Havens MEC47 rules](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec47_rules.pdf)
  supply fleet preparation, Sailing, Boarding and the separate Corsair deck.
  The generated snapshot's `sources.expansionRules` points to these shared
  rules; MEC53 above supplies this Adventure Pack's additional instructions.
- [Hall of Beorn original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/The-City-of-Corsairs)
  independently confirms every original standard/easy quantity and the seven
  encounter sets. Its Nightmare column was excluded.
- Original front/back scans from the catalog's DragnCards sources and the nine
  RingsDB player scans were downloaded and visually checked. The immutable
  scenario snapshot pins every original face's URL, local path, byte length and
  SHA-256. The player hashes below pin the nine additional scans.

The unmodified source files are:

| File                                                | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                               | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                             | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/pending/the-city-of-corsairs-import.json` | `3a97eabbb41c8f9d424b8dcd95fa8706ffc80956b1a258c73523f5681e264804` |

The snapshot was generated with
`node scripts/prepare-scenario-import.mjs --recipe Q06.9 --download`. It contains
**38 scenario identities and 43 faces**: 19 original CoC identities (15 encounters
and four quests), plus 19 shared Grey Havens identities. There is no rules proxy
in these recipes. The import adds **23 scenario JPEGs and nine player JPEGs**,
and reuses 20 already cached scenario faces. The original 60-card Adventure Pack
is accounted for by 25 player cards, 31 encounter cards and four quest cards.

## Printed corrections applied only to runtime data

The catalog and pending snapshot retain their original bytes. The runtime JSON
records the following corrections established by the cached printed faces:

| Card                     | Catalog issue                             | Printed original                                                                                                                              |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Stormcaller              | 16 hit points                             | **18** hit points; other stats and Victory 10 unchanged                                                                                       |
| Captain Sahír            | Victory omitted                           | **Victory 20**                                                                                                                                |
| Final Confrontation 4B   | "While another enemy has resources on it" | **"While any enemy has resources on it, Captain Sahír gains indestructible."** This includes Sahír himself.                                   |
| Southern Belfalas        | Shadow appended to its main text          | Travel text and "If this attack destroys a character, discard an ally controlled by the defending player" occupy separate main/shadow fields. |
| Corsair Waters           | Shadow appended to its main text          | The ally limit and "Either shift your heading off-course, or treat this attack as undefended" occupy separate main/shadow fields.             |
| City of Corsairs         | Threat stored as 0; position 160          | Printed threat **X**, position **161**. The numeric runtime base remains 0 and its rule supplies X.                                           |
| Umbar Harbor             | Position 161                              | Printed position **162**                                                                                                                      |
| Fate of The Dream-chaser | Coast of Umbar encounter-set metadata     | The printed card belongs to **The City of Corsairs** encounter set.                                                                           |
| The Coast of Umbar 1B    | Missing off-course icon labels            | The three existing Heading states are written as `1/4`, `1/2`, `3/4`.                                                                         |
| Starlit Sea (shared)     | Refers to "Uncharted Ocean"               | The already established original correction refers to **Starlit Sea** itself.                                                                 |

The Haven of Umbar 3B has **18** quest points and flavor text only. No missing
When Revealed, Forced or other functional back text is invented. Quest 2 has
zero quest points and advances immediately after resolving its two faces;
quest 4 has zero quest points and wins through Sahír's destruction.

The original easy recipe has one missing orange-ring removal: **Slave Ship is
one copy, not two**. Hall of Beorn gives standard/easy quantities of 2/1, and confirms this original easy-mode removal. All other source standard/easy
quantities are retained.

## Recipe sections and the transition ashore

The seven original encounter sets are The City of Corsairs, Coast of Umbar,
Stormy Weather, Umbar Fleet, Voyage Across Belegaer, Corsair Raiders, and
The Dream-chaser's Fleet.

| Recipe section                                   | Standard |   Easy |
| ------------------------------------------------ | -------: | -----: |
| Quest deck                                       |        4 |      4 |
| Active sea encounter deck                        |       32 |     21 |
| Separate Corsair deck                            |       10 |      6 |
| Inactive City deck (recipe section)              |       15 |     11 |
| Set aside (Sahír, Monument, four ships, Heading) |        7 |      7 |
| Staging (Stormcaller and two Southern Belfalas)  |        3 |      3 |
| Total physical recipe cards                      |   **71** | **52** |

Removing the four quest cards gives Hall of Beorn's **67 standard / 48 easy**
encounter-card totals. For one or two players, only one Southern Belfalas starts
in staging; the other returns to the sea deck, giving 33/22 cards before any
further setup effects. Three or four players start with both Belfalas copies
in staging, leaving 32/21 in the sea deck.

The DragnCards recipe prepositions Sahír and the Monument in set-aside storage.
The printed 1A instruction instead sets aside the **entire** City encounter set
as the inactive second deck. Runtime setup can therefore place those same two
physical cards in the inactive deck (17 standard / 13 easy), then execute 3A's
search to set them aside. They must never be duplicated.

The original transition is:

1. At stage 1B, progress can be placed on the main quest only while on-course.
   Destroying the Stormcaller, or reaching 15 progress, advances to stage 2.
2. At 2A, each player assigns non-Ship damage equal to the total damage on all
   Ship objectives that player controls. Then discard all Ship enemies, Ship
   objectives and Ocean locations in play. Coastal Watch Towers remain.
3. At 2B, shuffle the Corsair deck and its discard pile into the inactive City
   deck. Search the old encounter deck and discard for every Battle-Hardened
   and Watch Tower and move those copies into the City deck. **Watch Towers
   already in play remain in play.** Set the old sea encounter deck/discard
   aside, inactive; activate the City deck; advance to 3.
4. At 3A, set Sahír and the Monument aside from the active encounter deck.
   Each player searches that deck for one enemy and one location and stages
   them. If the Stormcaller was not destroyed during stage 1, each Raider
   already in play gains one resource. The 18-point stage 3B has no other rule.
5. At 4A, stage the Monument, put Sahír into play engaged with the first
   player, let each player find an enemy in the encounter deck/discard, shuffle,
   then add one resource to every Raider in play.
6. At 4B, **any** enemy's resources make Sahír indestructible. A destroyed hero
   or enemy transfers its remaining resources to Sahír. Destroying Sahír wins.

Indestructible prevents destruction from damage even when damage equals or
exceeds hit points. Sahír additionally cancels each point of incoming damage
by discarding one of his resources, and makes one extra combat-phase attack
per complete group of five resources. The Monument makes each Raider with
at least one resource immune **to player events**, and adds one resource to
every Raider at the beginning of the resource phase.

The [ALeP designer-rulings compilation, section 3.226](https://alongextendedparty.com/semi-official-errata-faq-1-10/)
transcribes Caleb Grace's **29 November 2016** clarification of the original
2A transition. Asked about shadow cards carrying sea cards into the active land
deck, he replied that stage 2A should also force players to discard **each shadow
card in play**, and proposed: "Discard all Ship enemies, Ship objectives, Ocean
locations and shadow cards in play." Runtime follows this designer clarification
and discards those shadows into the old sea discard before switching decks.
The printed original quest scan and immutable catalog remain unchanged. This
is the cited designer ruling, distinct from the compilation's optional community
errata wording.

The [official FAQ 1.9, section 1.47, pages 8–9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf)
distinguishes direct card effects from framework effects. Retrieved PDF SHA-256:
`a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
Immunity prevents directly targeting, damaging, moving or changing the protected
enemy through a player event, including event effects that affect several
enemies without saying "choose." Ordinary attack damage still works. The FAQ
explicitly allows **Quick Strike**, which targets a character and lets that
character make a normal attack; **Hands Upon the Bow** cannot pick an immune
enemy in staging. The Monument's printed restriction covers events only, so a
hero or ally ability remains legal. In particular, an ally entering through
Sneak Attack uses that ally's own Response: Guardian of Ithilien can return a
protected engaged Raider, and Gandalf can deal damage to it. The parent event
does not change the source of the nested ally's ability.

## Sailing and player scans

All fifteen new encounter fronts were inspected for printed Sailing helm
symbols, including the City cards that are normally inactive during Sailing.
Only **Southern Belfalas** and **Corsair Waters** have a helm, one each.
`city-sailing-icons.json` pins all fifteen results, including explicit zeroes,
to each original front's local path and SHA-256.

| Player code | Original design           | Local JPEG SHA-256                                                 |
| ----------- | ------------------------- | ------------------------------------------------------------------ |
| 12138       | Prince Imrahil            | `9aa2174680691979fc3a045f00be9b8f95cf79dddb2856f8d883579f37ce7cf3` |
| 12139       | Knight of the White Tower | `16cee74bc2d4b60de8332a72aa931f38ac1834d81aafcaf40c57b2933618e800` |
| 12140       | Hold the Line             | `23711f2a486f178184f6eddec8cec107c5923871807e8ebac56dd2d108e7c25c` |
| 12141       | Soldier of Dol Amroth     | `e126c3827d2307328ccea0ec039b8f3a0dec898aba9a68d7f4c7b05073fff331` |
| 12142       | Súlien                    | `58a15f91f4d5ee5cb7732a83071747819876ba235aa535bf8803bababe9f3961` |
| 12143       | Inspiring Presence        | `02b340214a54a2bb69b889e2703a3fdad0c93db232f75e73bf331d09033b7e71` |
| 12144       | Guardian of Ithilien      | `55a092aa4df3608c606667c4c32dfcc1c1c57c987ec525bc91fdc877672b92dd` |
| 12145       | Ranger Spear              | `a45fed6dccef4b17fc49340b6ad1a784a85d6b1bef3f346914f9c113ad7b0b26` |
| 12146       | Prince of Dol Amroth      | `1009a15f12c0acbfdcbd56e1a75a4d462e7f91e465c9b7af7994a5efd2fc9051` |

All nine player designs use their original catalog records and printed scans.
The Tactics Imrahil identity remains distinct from earlier Imrahil cards.
Knight of the White Tower was already registered in `passive-player-cards.json`
and uses the existing single-resource-pool payment rule. The nine original
records therefore add **eight new runtime definitions**, with Knight reused once.
There are no additional alternate-art or revised player records in this pack.
