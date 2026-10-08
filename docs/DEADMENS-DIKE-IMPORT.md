# Deadmen's Dike source import

`deadmens-dike` uses the original Lost Realm standard/easy recipes Q05.3 and E05.3. The reference catalog and immutable preparation snapshot keep the source slug `deadmen-s-dike`; the runtime scenario identifier is `deadmens-dike`. Active definitions and recipes live in `src/data/deadmens-dike-*.json`.

The source bundle has 21 original definitions and 23 local JPEG faces, including both fronts/reverses of the two quest stages. Iârion reuses his existing definition and artwork. The runtime adds eighteen encounter definitions and two quests, with twenty-two new local faces. Each prepared image retains its original HTTPS source, byte count and SHA-256.

| Recipe         | Encounter deck | Initially staged | Set aside  | Objective ally | Quest deck |
| -------------- | -------------: | ---------------- | ---------- | -------------- | ---------: |
| Q05.3 standard |             41 | 1 Fornost Square | 1 Thaurdir | 1 Iârion       |          2 |
| E05.3 easy     |             28 | 1 Fornost Square | 1 Thaurdir | 1 Iârion       |          2 |

The fixed Square is additional to the two copies in the encounter deck in either mode. These counts describe source zones before stage 1B searches a Baleful Shade for each player and reveals one encounter card per player. Both modes include four Baleful Shades, so every 1–4-player opening can find the required copies.

## Original-face details

- **The Shades of Angmar** has 11 quest points on its original reverse; **A Fell Wraith** has 13. Those values are missing from the upstream numeric fields and are supplied by the runtime.
- **Thaurdir** is the original single-face, unique, nine-hit-point enemy with Indestructible and no attachments. His printed Sorcery trigger heals three damage and causes an immediate attack against the first player. He has no Captain/Champion or Sorcerer mode in this scenario.
- **Broken Battlements** reads “each player discards the top 5 cards of his deck and places 1 time counter here.” The timeout therefore replaces one counter per player, rather than one counter for the group or a reset to printed Time 3. Counters tick even when the location is not active.
- **Iârion** follows the existing uniqueness ruling while retaining the original scan and X willpower/attack/defense. Those values count all quest cards in play.
- Runtime text fixes obvious OCR errors in the stage-1 “must” and the Norbury Tombs/Power of Angmar “shuffles” sentences, and renders Iârion's accented name consistently. The historical preparation snapshot remains unchanged.

Sources: [official Lost Realm rules](https://images-cdn.fantasyflightgames.com/filer_public/88/d6/88d6e80d-e75d-468f-8484-76c56b15e895/mec38_insert_web.pdf), especially the encounter-side-quest/Time rules on pages 2–3 and Deadmen's Dike/Indestructible on page 9; original local faces in `src/data/pending/deadmen-s-dike-import.json`; and the pinned DragnCards recipes. The official Indestructible definition prevents destruction by damage even when damage equals the enemy's hit points.

Reproduce source checks:

```sh
npm run prepare:scenario-import -- --recipe Q05.3 --check
node --import tsx --test tests/pending-imports.test.ts
node --import tsx scripts/browser-deadmens-dike.mjs
```

Source audit proof is recorded in `output/deadmens-dike/data-proof.json`, including SHA-256 for all 23 original faces, the exact shared Iârion identity and corrected OCR fields. The final local browser run decoded all 23 faces and passed 135 checkpoints; its saved proof is `output/deadmens-dike/local-report.json`. See [Deadmen's Dike rules](DEADMENS-DIKE-RULES.md) for gameplay and validation. Campaign and Nightmare variants remain reference-only.
