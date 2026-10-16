# The Dungeons of Cirith Gurat — original source audit

Only the original, non-Nightmare scenario is imported. The immutable source catalogs are `public/catalog.json` and `public/scenarios.json`; original recipes are **Q07.8** and **E07.8**. The source bundle is `src/data/pending/the-dungeons-of-cirith-gurat-import.json`. Shared Harad Territory and Mordor Orcs definitions remain in the existing Harad data.

## Publisher evidence

- [Official FFG product page](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/dungeons-cirith-gurat/) links the original MEC60 insert.
- [Official MEC60 rules PDF](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec60_web_the_dungeons_of_cirith-rules.pdf), pages 1–2, confirms difficulty **7**, the encounter sets **The Dungeons of Cirith Gurat**, **Mordor Orcs**, **Harad Territory**, and the captive rules.
- [Official FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19.pdf), section 1.17, explains that a guarded objective remains attached until its guard leaves play, then becomes unguarded. The scenario's Forced rescue immediately returns it to its owner, exhausted. Section 1.23 distinguishes an attached objective's status from ordinary attached cards.

The MEC60 insert explicitly states that captured characters **lose their original card type and player-card status**, become objectives, and regain both when rescued. They therefore do not remain usable characters while captive and do not trigger ally-entry abilities merely by being rescued.

## Physical recipe reconciliation

The source contains 25 identities and 28 original faces: three double-sided quests and 22 other identities. Sixteen identities belong to this adventure pack: three quests, thirteen encounter/objective cards. Nine shared identities come from The Sands of Harad.

| Recipe | Quests | Source encounter deck | Set aside | Source staging | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Q07.8 | 3 | 38 | 1 | 7 | 49 |
| E07.8 | 3 | 28 | 1 | 7 | 39 |

The source staging is a four-player preselection: Captives, Dungeon Cell, Abaan, plus Jailer, Prison Guard, Uruk of Mordor and Uruk Warg-Rider. The printed setup requires every actual player to choose a different Orc. Runtime restores those four Orcs to the source encounter deck, then performs the actual searches. Thus the complete initial encounter pool has **42/32** standard/easy cards, and the deck after setup has **42−players / 32−players** cards. This does not create additional copies.

The easy recipe removes one each of Jailer of Cirith Gurat, Dungeon Warg, Dungeon Cell, Uruk Guardroom, Taken Prisoner, Injured Companion, Enfeebled, Uruk Warg-Rider, Mordor Warg and Fear of Mordor. The exact recipe rows are checked against the immutable public source in the import tests.

## Printed face review and corrections

All nineteen new adventure-pack faces were visually reviewed from the original locally cached images, including all six quest faces. The review contact sheet is `output/cirith-gurat-sources/contact-sheet.jpg`; individual quest faces were inspected at their original resolution. The runtime quest order and printed quest points are **10 → 15 → 10**.

A material omission in the reference catalog was found on **Rescue the Prisoners 1B**. Its original image includes:

> Each enemy and location in the staging area that is guarding an objective is immune to player card effects.

The imported quest definition restores that sentence and the runtime implements its staging-only immunity. The immutable catalog and source bundle remain unchanged.

The card faces confirm the printed Prison Guard defense bonus, Dungeon Cell's printed-willpower threat, all five travel/When Revealed location effects, Jailer and Taken Prisoner shadows, stage 2 resources, and stage 3's standard engagement checks. No Nightmare face is used.

Artwork is downloaded through the import preparer from the original DragnCards S3 URLs, with independent front/back paths. The pending bundle records source URL, local path, byte count and SHA-256 for every face. Native import tests compare all 28 local byte hashes with those records. Browser verification also decodes and hashes the served bytes.
