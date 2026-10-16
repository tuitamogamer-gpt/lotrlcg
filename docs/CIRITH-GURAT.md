# The Dungeons of Cirith Gurat

The original **The Dungeons of Cirith Gurat** scenario supports standard/easy difficulty and one to four local players. Its difficulty is 7. It uses The Dungeons of Cirith Gurat, Harad Territory and Mordor Orcs encounter sets. See [the source audit](CIRITH-GURAT-SOURCES.md) for official rules, artwork, physical recipes and the restored printed stage 1B immunity omitted by the reference catalog.

## Captives and rescue

The Captives objective and Dungeon Cell start in staging; Abaan starts attached to that Cell. Each participating player chooses a different Orc from the actual encounter pool, then discards player-deck cards until finding an ally not already in play and chooses an unattached Orc to guard it.

Captured characters retain their physical identity and owner. They lose character status and player-card status, and become blank objectives outside any player's control. Their attachments and all tokens are discarded. When the guarding encounter card leaves play, its entire group of captives is rescued together, returning exhausted to each original owner's control. Stage 1 reveals one encounter card per simultaneous rescued group. Abaan follows the first player when free and his departure loses the scenario.

The visible scenario panel lists every face-up captive and its physical guard, the current quest and its progress, and stage 2's quiet-round resources. It offers both original faces of all three quest cards.

## Quest progression

1. **Rescue the Prisoners** has 10 quest points. Enemies and locations in staging that guard objectives are immune to player-card effects. All captives must be rescued before advancing.
2. **Sneak Past the Guards** has 15 quest points. Shuffle the encounter discard into the deck and discard to add one enemy per player. Staging enemies cannot take damage and gain engagement cost equal to this stage's progress. At each round end, reveal one encounter card, then add a quest resource if no enemies were engaged that round. Two resources are required to advance.
3. **Fight Your Way Out** has 10 quest points. Add the set-aside Uruk Chieftain, capture a chosen hero per player under an unattached staging enemy, and perform standard engagement checks with unguarded enemies' engagement costs reduced to zero. At each quest-phase beginning, discard until adding an enemy. Rescue every remaining captive and complete the stage to win.

All new location travel costs, Jailer capture, Prison Guard damage capture, Dungeon Warg's immediate attack and tie selection, Torture Room deck search, Taken Prisoner, Tormented by Orcs, Captured!, Abaan's optional exhaustion response and their shadows are handled through saved native decisions. Gate of Iron blocks staging-location progress. Uruk Guardroom increases ally play costs. Mines caps only player-card threat reduction at one. Shared Mordor Orcs and Harad Territory rules reuse their established engine support.

## Verification

Run the focused native suites with Node 22:

```sh
node --import tsx --test tests/cirith-gurat-import.test.ts tests/cirith-gurat-scenario.test.ts
```

`tests/cirith-gurat-browser-fixtures.ts` and `scripts/browser-cirith-gurat.mjs` exercise all eight player-count/mode setups, native travel, encounter reveals, shadows, quest advancement, the last rescue and victory, saved pending decisions, all printed scenario/quest faces, and served artwork hashes at 1280, 390 and 320 pixels. Final browser verification uses the release's frozen URL. `CIRITH_GURAT_WIDTHS` and `CIRITH_GURAT_OUTPUT_DIR` support isolated rehearsals.
