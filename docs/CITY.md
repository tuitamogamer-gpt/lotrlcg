# The City of Corsairs

This import covers all nine original Adventure Pack player designs and the original
standard/easy adventure for solo and one to four players in local hot-seat.
Knight of the White Tower reuses its existing registration, adding eight player
definitions. The adventure completes the original Dream-chaser cycle. The next
chronological import is The Sands of Harad. Revised campaign and
Nightmare variants retain their own support gates.

The [original-source record](CITY-SOURCES.md) documents the original MEC53 rules,
the 38 scenario identities and all 43 artwork faces, corrected runtime values,
Sailing symbols and the physical standard/easy recipes. The reference catalog
and reference recipes remain unchanged.

The adventure starts at sea with Sailing, fleet preparation and a separate
Corsair deck. Players can reach Umbar by placing fifteen progress on the first
quest while on-course or by destroying the Stormcaller. The fate of the
Stormcaller is retained through the land stages.

The two faces of the second quest resolve the fleet's damage and discard the
ships, then activate the second encounter deck. Remaining Corsairs and the
specified sea encounters join that land deck; the old encounter deck and
discard remain inactive. The public scenario state exposes pile counts
without exposing hidden order. The original four quests, both decks,
Raider resources, fleet choices and pending decisions survive saved games.

Raider resources affect enemy statistics and Captain Sahír's damage prevention
and additional attacks. At the final quest, Sahír is indestructible while any
enemy has resources, including Sahír himself. His actual destruction wins the
game. Merely placing quest progress cannot bypass that victory condition.

See [player rules and interactions](CITY-PLAYER-SCRIPTS.md) and the detailed
[scenario rules and interpretation notes](CITY-RULES.md).

The account-choice SQL migration is additive. Local migration checks do not
configure or migrate a hosted account database.

## Verification

Use Node 22 and the locked dependencies:

```sh
npm ci
npm run check
npm run test:engine
npm run audit:rules
npm run build
npm run test:city-simulation
npm run test:city-multiplayer
npm run test:browser-city
```

The dedicated review matrix covers standard/easy mode, one to four players and
all four event-review modes. It restores saves after every action and compares
the final rules state, including random-number state, physical cards, both
encounter decks, resource pools and outcomes. Independent observers check
Corsair conservation and prevent unrevealed deck order from changing the public
projection.

The browser scenario suite uses the ordinary controls at 1280, 390 and 320
pixels. It covers fresh standard/easy setup for all player counts, actual
Sailing decisions and quest resolution, the transition to land, saved choices,
and the original encounter and quest dialogs. Every original artwork file is
retrieved over HTTP, checked against the pinned SHA-256 and decoded in the
browser. Each report records the JavaScript artifact actually served.

Local release checks passed **4,120 engine tests**, without failures or skips,
plus TypeScript, the coverage audit and production build. Four additional
observer regressions verify queued encounter reveals, the distinction between
physical cards and review references, and shadow cards temporarily held by
current or suspended immediate attacks. Negative cases still reject a genuinely
missing Corsair. A replay of the exact reviewed land reveal confirms that the
queued Raider enters play with the same conserved inventory after restoration.

The scenario browser suite passed **183 checkpoints** at 1280, 390 and 320 pixels,
with no browser errors. It inspected exactly all **43 original printed faces**
and independently verified all 43 artwork files. Its HTTP witnesses identify
`index-Dezhnapm.js` (317,851 bytes, SHA-256
`8f1147f0d6a138ad743ab7471ac766a4662da782213d9bd5f9c57fb06c6d56ac`).
The printed quest dialogs use the promoted original definitions, including the
correct final-stage resource condition; the empty Haven of Umbar reverse does
not repeat its setup-side ability.

The player browser suite passed **87 checkpoints** at the same widths, including
all nine player faces and their actual actions, with no browser errors. Its
original witnesses identify `index-BxECMRlV.js` (317,839 bytes, SHA-256
`95a9233aa8e743cb23bf8c2b0370ccff540e3b48d3e689252e184a7196599f4f`).
The only later application change is the printed-quest dialog correction in
`App.tsx`; the gameplay modules and card data are unchanged. The final-artifact
scenario run above covers that correction.

Complete-game matrix results and production proof retain their exact source
and artifact records under ignored `output/`. The complete suites also run in
CI on the published commit.
