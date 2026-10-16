# Original The Black Serpent sources

Checked 16 October 2026. This import promotes the original **MEC59** scenario,
standard **Q07.7** and easy **E07.7**, using original English scans.

- [Publisher MEC59 rules PDF](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec59_web_the_black_serpent-rules.pdf),
  linked by the official LOTR LCG support page, returned HTTP 200: **2,861,729
  bytes**, SHA-256 `24c4f78d2eb1e50c0e34c190f0d5061fa76ad24ac1490993d3819d49f911dab1`.
  Its first page specifies **difficulty 8**, encounter sets **The Black Serpent**
  and **Harad Soldiers**, and the new **Guarded (X)** keyword. Discard from the
  encounter deck until a matching enemy/location is found; add that card to
  staging and attach the objective. The guarding card is **not revealed**.
- [Official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf):
  **14,383,996 bytes**, SHA-256 `a82b0e7e1fe27d942eaeae9426e6821ccc8157dad9a424e70d2f5bafa604e7d9`.
  Its checked text contains no Black Serpent-specific erratum. Its general
  attachment, immunity and timing rules apply. The checked local PDF is the
  existing unchanged publisher download under `output/race-harad-release/sources`.
- [Hall of Beorn original inventory](https://hallofbeorn.com/LotR/Scenarios/The-Black-Serpent)
  confirms **41 standard / 33 easy non-quest physical cards**. Nightmare
  inventory was excluded. Easy removes one each of The Serpent's Redoubt,
  Roofless Tower, Broken Courtyard, Bold and Grim, No Quarter, Southron
  Soldier, Southron Archer and Nowhere to Hide. Both promoted recipes match
  their immutable upstream rows and sections exactly.
- The DragnCards original English faces are pinned in
  `src/data/pending/the-black-serpent-import.json`: source URL, local path,
  byte count and SHA-256 for **25 faces** (20 new MEC59 faces and five reused
  Harad Soldiers faces). Every new face was visually read, including the six
  quest faces and easy-mode rings. Five new encounter designs have at least
  one easy-removal copy; the inventory resolves copy counts where the stored
  representative scan is the standard retained copy.

| Immutable input                                  | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `public/catalog.json`                            | `cc2f96ffac0b8baad068321c61d28bad2beffdb346e0d3ec486977714268ad63` |
| `public/scenarios.json`                          | `00db2f76f970f201f0f7e14663c9f4c87212c1a80548a9d325d39656ea869b0f` |
| `src/data/official-player-cards.json`            | `9cf8bae3f97e63f9bf42b067f94645c2ec991a1a33692cbb4fe459087dc575cd` |
| `src/data/pending/the-black-serpent-import.json` | `e879ac9e2eb6a76aac2ce8c2ef4632661ac7fca77be8e90df235e34ba6f46ddd` |

The snapshot was prepared with `prepare-scenario-import.mjs --recipe Q07.7
--download`, serialized with the batch import lock, and its publisher PDF URL
recorded before freezing. The three global upstream source JSON files remain
unchanged. Corrections below apply only to promoted runtime records.

| Original printed face                                                  | Upstream error                          | Promoted value                                  |
| ---------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Banner of the Serpent, The Serpent's Garb, Summons from Mordor (91–93) | Unique icon omitted                     | All three objectives are unique                 |
| The Black Serpent (94)                                                 | Unique icon omitted                     | Unique enemy                                    |
| Serpent Guard (95)                                                     | Forced text names “The Serpent's Guard” | “Serpent Guard”                                 |
| Desert Bastion (98)                                                    | Counts objectives attached to heroes    | Counts Harad objectives **the players control** |
| Bold and Grim (101)                                                    | Omits both keywords                     | **Surge. Doomed 1.** before When Revealed       |
| Don't Let Them Escape! (104)                                           | Title capitalization differs            | Printed title restored                          |
| The Crossroads Fort (106A/B)                                           | Uses “Crossroad's”                      | **The Crossroads Fort** on both faces           |
| Battle in the Camp (107B)                                              | Six quest points                        | **5** quest points                              |

All remaining new encounter and quest stats/rules match the inspected original
faces. Main quest points are **6 / 5 / 6**. The boss's printed stats are
**0 threat, 2 attack, 1 defense, 8 hit points, engagement 50** and its current
main-stage number adds to threat/attack/defense. Its unique icon matters to
Bold and Grim's shadow and No Quarter's shadow. Don't Let Them Escape! has
**6 quest points, Victory 10**. Southron Champion retains **4 quest points,
Victory 10** and the reused Harad Soldiers definitions.

| Mode           | Quest deck | Encounter deck before setup | Set aside | Staging |  Total |
| -------------- | ---------: | --------------------------: | --------: | ------: | -----: |
| Standard Q07.7 |          3 |                          37 |         3 |       1 | **44** |
| Easy E07.7     |          3 |                          29 |         3 |       1 | **36** |

The three actual objectives start set aside; the actual boss starts staged.
One random objective is revealed at setup and guarded through discard, one
at stage 2, and the final objective attaches directly to the boss at stage 3.
These movements conserve the original physical copies. New MEC59 encounter
components total **29**, and quests total **3**; together with the original
28 physical player cards, the Adventure Pack contains **60** cards.
