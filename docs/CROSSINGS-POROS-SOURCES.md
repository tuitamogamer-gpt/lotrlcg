# Original Crossings of Poros sources

Verified on 16 October 2026 against the original MEC61 Adventure Pack, original
Q07.9/E07.9 inventories, all 45 original scenario faces, and the publisher's
rules and FAQ. Nightmare and later campaign material are excluded.

- [Publisher MEC61 rules sheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec61_web_the_crossing_of_poros-rules.pdf): HTTP 200, 3,425,108 bytes, SHA-256 `a956ee5ec6b3d9aac87cdcf44a7d79d81327b27398f8bb27a2a47257d5aa3324`.
  Page 1 specifies difficulty **5**, the six encounter sets, the permanent
  incorporation of individual cards taken from set aside sets, and the
  distinction between **set aside** and **removed from the game**.
- [Official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf) supplies general timing, immunity, attachments and ownership rules. It has no scenario-specific erratum for this scenario.
- [Hall of Beorn original scenario inventory](https://hallofbeorn.com/LotR/Scenarios/The-Crossings-of-Poros) supplies **64 standard / 50 easy non-quest components**, plus seven double-sided quests. Nightmare quantities are excluded.
- All **45 scenario faces** were downloaded from the original DragnCards English
  image store with the serialized `prepare-scenario-import.mjs --recipe Q07.9
--download` workflow, then visually read. The immutable snapshot records
  each source URL, local path, byte count and SHA-256.

| Immutable input                                       | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `public/catalog.json`                                 | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                               | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`                 | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/the-crossings-of-poros-import.json` | `0f28cb929efc5d0416020b08f0ceb3084bcd7e18aeab0403e01daacb40583868` |

The snapshot preserves upstream errors. Printed corrections are confined to
promoted runtime records and recipes.

| Promoted correction                                | Original printed evidence                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Poros Garrison missing stats, trait and uniqueness | Unique **Gondor** objective-ally: **3 willpower, 4 attack, 3 defense, 6 hit points**.  |
| Poros Garrison says the last player controls it    | Both its own face and stage 4A specify the **first player**.                           |
| Desolate Land threat placeholder                   | Printed **X**, the highest number of characters controlled by a single player.         |
| Southron Soldier shadow omits restriction          | Choose a **non-unique** enemy in the staging area.                                     |
| The Ephel Duath                                    | Printed title **The Ephel Dúath**.                                                     |
| Find a Way Down has flavor merged into abilities   | Separates printed Surge, threat-reduction prohibition, and optional defeated response. |
| Easy recipe contains one Mordor Warg               | Original easy inventory retains **both** copies; restore the missing second copy.      |
| Source setup storage differs by mode               | Both modes set **Poros Garrison aside** and put **The Black Serpent in staging**.      |

| Recipe | Quest cards | Deck before setup | Staging | Set aside | Total physical |
| ------ | ----------: | ----------------: | ------: | --------: | -------------: |
| Q07.9  |           7 |                15 |       1 |        48 |         **71** |
| E07.9  |           7 |                12 |       1 |        37 |         **57** |

The standard and easy printed quantities differ for Desolate Land (3/1),
Danger Close Behind (2/1), Foothills of Mordor (3/2), Shadowy Vale (2/1),
Mountains of Shadow (2/1), Towering Dunes (3/2), Sandstorm (2/1), Sand Viper
(2/1), Southron Soldier (3/2), Southron Archer (4/3), Nowhere to Hide (3/2),
Uruk Warg-rider (2/1), and Fear of Mordor (2/1). All other component quantities
are identical between original standard and easy mode.

Stage 2 removes only the unchosen encounter set's **remaining set aside**
cards. Individual cards previously incorporated into the encounter deck
remain in that deck for the rest of the game. Stage 4 searches only the deck
and discard for enemies from the first encounter-set icons on the two set
aside stage 3A cards. It does not pull untouched set aside enemies into play.

The Black Serpent remains in staging and cannot take damage throughout the
scenario. Its attack is an attack from staging against the first player.
Victory requires 20 progress at the end of combat, after all enemy attacks
and their destroyed-character progress penalties have resolved.
