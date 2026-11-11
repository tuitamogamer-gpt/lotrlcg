# The Massing at Osgiliath

The 2012 Gen Con scenario, later sold as a print-on-demand pack, is the first
standalone quest imported after The Vengeance of Mordor cycle and the first
remaining release in publication order. It is playable in classic solo and
with one to four local players. It has no player cards.

## Sources and corrections

- The quest cards carry every rule; the scenario has no separate rules insert
  and prints no difficulty level. The atlas shows 8, from the
  [Hall of Beorn community rating](https://hallofbeorn.com/LotR/Scenarios/The-Massing-at-Osgiliath)
  of 7.5.
- The single published recipe, Q99.01, has 41 encounter cards and four quest
  cards. Hall of Beorn lists identical normal and easy quantities, so no card
  is marked for easy mode: easy mode only adds the usual extra resource to each
  hero. `tests/massing-osgiliath-source-quantities.json` keeps all 19 rows.
- `scripts/prepare-scenario-import.mjs --standalone` prepares a scenario that
  has a standard recipe only. The immutable snapshot is
  `src/data/pending/the-massing-at-osgiliath-import.json`, SHA-256
  `4787b08c95f306fcd8e6876354d6f5ceeb8c041afbb1112cda0f9c21682df6b6`.
- `tests/massing-osgiliath-art.json` pins source URLs, byte lengths and SHA-256
  for all **23 visually reviewed faces** (15 encounter cards and both sides of
  the four quest cards).

The reviewed scans correct **Ruins of Osgiliath**: it gets +3 threat while the
players have **not** crossed the Anduin (the catalog had dropped "not"). They
also restore Ranger of Ithilien's 2 willpower, the "Scout cards" spacing in the
setup text, the closing parenthesis of Cut Off's shadow and the line breaks of
every quest card. Stages 2A–4A are flavour only; Race to Minas Tirith's When
Revealed is printed on side 4B.

## Scenario rules

Setup places three Scouts per player in the staging area, one each of Snaga
Scouts, Wolves from Mordor and Wainriders, from the twelve set-aside Scouts. The
unused Scouts are shuffled into the encounter deck and The Witch-king waits set
aside, as a physical card, until stage 4B.

| Stage | Quest points | Rules |
| --- | --- | --- |
| 1B Beyond Expectations | 7 | West Bank locations cannot be traveled to. |
| 2B Through the Ruins | 5 | West Bank travel is closed. Each player can play or put into play only one card from hand each round; allies put into play from hand after the limit return to the hand. |
| 3B Anduin Crossing | 1 | No East Bank or West Bank travel. Card effects cannot place progress on the quest or the active location; quest resolution still can. A player who commits characters first discards a hero or a Ranger of Ithilien they control. |
| 4B Race to Minas Tirith | 15 | When Revealed adds The Witch-king and the players have crossed the Anduin. East Bank travel is closed. Defeating this stage wins. |

| Card | Behaviour |
| --- | --- |
| The Witch-king | Player attachments cannot be played on him. While he is in the staging area each character gets −1 willpower. After he attacks, the defending player raises their threat by 3 or he returns to the staging area. |
| Snaga Scouts | At the beginning of the encounter phase every copy engages the player with the lowest threat; the first player breaks ties. |
| Wolves from Mordor | After an attack destroying a character it is shuffled into the encounter deck. Shadow: 2 damage to the defending character. |
| Wainriders | Each point of combat damage it deals raises the defending player's threat by 1. |
| Wainrider Captain | When Revealed moves the top Scout enemy (two after the crossing) from the discard pile to the staging area. Shadow: +2 attack for an undefended Scout. |
| Uruk Vanguard | +3 attack after the crossing. Shadow: +1 attack (+2 after the crossing). |
| Captured Watchtower | +3 threat after the crossing. Shadow: the defenders leave combat and the attack is undefended. |
| Ruins of Osgiliath | +3 threat before the crossing. |
| Emyn Arnen Overlook | While it is in play, the first Scout revealed each round gains surge and doomed 2. |
| Morgulduin | While active, each committing character takes 1 damage. Shadow before the crossing: the active location returns to the staging area and Morgulduin becomes active. |
| Pelennor Fields | After the crossing, when the players may travel, they travel to a Pelennor Fields or every player raises threat by 3 for each copy in the staging area. Victory 1. |
| Cut Off | Doomed 1; each player discards every ally from hand. Shadow: discard one ally (two if undefended) or the attacker gets +3 attack. |
| Dark Pursuit | +1 staging threat per Scout enemy in play until the end of the phase, otherwise surge. |
| Massing at Osgiliath | Surge; until the end of the phase every card revealed from the encounter deck gains doomed 1 (3 after the crossing). |
| Ranger of Ithilien | The first player takes control of it exhausted and committed, then it surges. Shadow: 2 damage to the attacker, and the defending player may exhaust a character to take control of it. |

Engine additions: optional scenario hooks for travel-phase beginnings,
additional doomed on reveal, commit costs and allies put into play from hand,
the played-from-hand flag on played cards, and a marker separating quest
resolution progress from card-effect progress.

## Verification

```sh
npm run test:engine
npm run test:massing-osgiliath-simulation
npm run build
npm run test:browser-massing-osgiliath
npm run audit:rules
```

The focused suite covers one-to-four-player normal/easy setup and inventory,
every stage, travel ban, the hand limit, the commit cost and progress lock,
every enemy, location, treachery and shadow, Ranger of Ithilien and malformed
saves. The complete-game matrix plays fourteen games with exact save
restoration after every action, physical conservation and private-view checks,
and six review-mode comparisons. The browser suite uses real controls at 1280,
390 and 320 pixels and checks all 23 served image hashes and decodes.

The additive account-choice SQL migration is included; it has not been applied
to a hosted database.
