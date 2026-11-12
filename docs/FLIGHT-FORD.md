# Flight to the Ford

The third scenario of **The Lord of the Rings: The Black Riders** (2013), in
The Lord of the Rings Saga. It is playable in classic solo and with one to
four local players, in normal and easy mode. Campaign mode is not part of
this import, so The Old Road's campaign-only Action is never offered.

## Sources and corrections

- The Saga rules (the Ring-bearer, The One Ring, staging in player order and
  Peril) are those of A Shadow of the Past; see [its rules](SHADOW-PAST.md).
- The scenario notes of
  [Vision of the Palantir](https://visionofthepalantir.com/2018/06/13/flight-to-the-ford/)
  describe the setup, the burden deck (whose cards keep their Surge when The
  Last Bridge or Stricken Dumb reveals them) and each encounter card.
- Recipe Q0B.03 matches the normal quantities on
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Flight-to-the-Ford):
  51 encounter cards without the campaign card, including the five burdens.
  Hall of Beorn's community rating of 5.6 gives the atlas difficulty of 6.
- **Easy mode keeps 1 of the 3 Black Steeds**, as Hall of Beorn gives (38
  encounter cards) and as A Shadow of the Past already uses. The catalog's
  easy recipe E0B.03 kept all 3. The corrected quantities are recorded in
  `tests/flight-ford-source-quantities.json`.
- The immutable snapshot `src/data/pending/flight-to-the-ford-import.json`
  has SHA-256
  `f370ec323851e8691d9e3a35f0314daa9425baea81099747ce345267cfd39fdc`.
- `tests/flight-ford-art.json` pins all **30 faces**. The 20 new ones were
  checked by eye and correct the catalog:
  - **The Nine are Abroad has no Peril keyword** on the printed card.
  - The printed name is Race to Rivendell.
  - "The Witch-king", "Ring-bearer's", "+1 [attack] and +1 [defense]", "on
    top of the encounter deck" and the full stops after "Immune to player
    card effects" follow the cards.
  - The five burdens come from RingsDB with markup; they are stored as plain
    encounter treacheries with their shadow effects.
- Black Steed, Rode Like a Gale, Pathless Country and Piercing Cry come from
  A Shadow of the Past; Ringwraith, The Witch-king, Pale Blade and Power in
  their Terror come from A Knife in the Dark. Their rules live in the shared
  modules `src/game/black-riders-hunted.ts` and
  `src/game/black-riders-nazgul.ts`.

## The Ring-bearer's life

Setup attaches **An Evil Wound** to the Ring-bearer and sets his life at 15.
Damage that the Ring-bearer would take reduces his life by the same amount
instead, and he cannot be healed. Each stage reduces his life by 1 at the end
of the round; Fell Riders, Ettenmoors and Pain Assailed Him take more. When
his life reaches zero the players lose. The scenario panel shows the life.

## Stages

| Stage                      | Quest points | Rules                                                                                                                                                                                                                                                             |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Pursued by the Enemy | 15           | Setup: the burden deck is shuffled, An Evil Wound is attached, Ford of Bruinen and The Witch-king are set aside, The Last Bridge and 1 Fell Rider per player go to the staging area. The players cannot advance unless The Last Bridge is in the victory display. |
| 2A/2B Race to Rivendell    | 15 (+15)     | When Revealed: Ford of Bruinen and The Witch-king are added to the staging area. +15 quest points while at least 1 Nazgûl enemy is in play. Defeating this stage wins the game.                                                                                   |

## Encounter cards

| Card                  | Behaviour                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Last Bridge       | X threat (players). Immune to player card effects. Travel: the first player reveals the top burden and resolves it as if revealed from the encounter deck. Victory 3.                          |
| Ford of Bruinen       | Immune to player card effects. Travel: the first player reveals the top encounter card. After it leaves play as an explored location, every engaged enemy is discarded. Victory 5.             |
| Fell Rider            | Nazgûl, no non-Morgul attachments. While in the staging area, at the beginning of the encounter phase the first player engages it or reduces the Ring-bearer's life by 1.                      |
| The Troll's Camp      | While active, each hero gets +1 willpower, attack and defense. Victory 1.                                                                                                                      |
| Ettenmoors            | While active, Nazgûl enemies get no shadow card during the combat phase. After progress is placed on it, the Ring-bearer's life is reduced by 1.                                               |
| The Old Road          | Its Action is for campaign mode only.                                                                                                                                                          |
| Stricken Dumb         | Peril. Shuffle the top burden into the encounter deck and reveal another card, or raise each player's threat by 3 and end the quest phase at once without resolving the quest.                 |
| The Enemy is Upon Us! | Each engaged enemy makes an immediate attack; with none, it surges. Shadow: if the attack destroys a character, all progress is removed from the current quest.                                |
| The Nine are Abroad   | Each character in play has a blank text box (Traits kept) until the end of the round; it surges while a Nazgûl enemy is in the staging area. Shadow: the attacker returns to the staging area. |
| Pain Assailed Him     | The Ring-bearer loses 1 life and has 0 willpower, attack and defense until the end of the round. Shadow: if the attack destroys a character, he loses 1 life.                                  |
| Weight of the Ring    | Burden, Surge. A Condition on the Ring-bearer: at the beginning of each quest phase the first player exhausts The One Ring or reveals an additional card that phase.                           |
| Fear of Discovery     | Burden, Surge. The first player exhausts the Ring-bearer or reveals another card. Shadow: the defending player raises their threat by 3.                                                       |
| Eaten Alive!          | Burden, Surge. The first player deals X damage (players) divided among the heroes they control. Shadow: 1 damage to the defending character.                                                   |
| Panicked              | Burden, Surge. The first player raises their threat by 3 and passes the first player token; the Ring-bearer follows it. Shadow: the defending player exhausts a character.                     |
| Overcome by Terror    | Burden, Surge. The first player exhausts The One Ring, or discards 2 random cards if it is already exhausted. Shadow: the defending player discards a random card.                             |

Interpretations:

- **Unused Fell Riders.** Setup adds 1 Fell Rider per player to the staging
  area; as with every setup instruction, the other copies stay in the
  encounter deck.
- **Revealed burdens** resolve as encounter cards, keep their Surge and then
  go to the encounter discard pile like any treachery. Frodo's response may
  cancel one revealed by The Last Bridge, which shuffles it into the
  encounter deck.
- **Stricken Dumb's second option** ends the staging step at once (the
  remaining players do not reveal their cards) and goes straight to the
  travel phase. Outside the quest phase it only raises threat.
- **Either/or choices** follow the project's rule that a fully resolvable
  option must be chosen when one exists: an empty burden deck leaves only
  Stricken Dumb's second option, and an exhausted Ring-bearer or One Ring
  forces the other option of Fear of Discovery, Weight of the Ring and
  Overcome by Terror.
- **Eaten Alive!** The first player assigns the damage one point at a time;
  damage given to the Ring-bearer reduces his life.
- **The Nine are Abroad** blanks the characters in play when it resolves.
- **Ford of Bruinen's Response** always resolves, since discarding the
  engaged enemies never hurts the players.

Engine additions:

- The shared Nazgûl module `src/game/black-riders-nazgul.ts`, now used by all
  three Black Riders scenarios.
- Ettenmoors uses the scenario shadow-card hooks, so it also blocks the
  Ringwraith's additional shadow card and the shadow of an immediate attack
  during the combat phase.

## Verification

```sh
npm run test:engine
npm run test:flight-ford-simulation
npm run build
npm run test:browser-flight-ford
npm run audit:rules
```

The focused suite (`tests/flight-ford.test.ts`, 18 tests) covers setup, the life and
An Evil Wound, both stages and the win, The Last Bridge, Ford of Bruinen,
every encounter card, burden and shadow, saves and the scenario panel. The
source test pins the snapshot, the quantities and all 30 faces.

The complete-game matrix plays fourteen games with exact save restoration
after every action, physical conservation (including the burden deck and the
set-aside cards) and private-view checks. Its policy never defends with the
Ring-bearer, keeps damage off him and travels to The Last Bridge and the Ford
first. The starter decks lose every game to this race: in each difficulty
some games explore The Last Bridge after paying its burden, and one normal
game reaches stage 2B, but no easy game of seeds 1 to 20 did. Stage 2B and the
victory are therefore covered by the focused and browser suites.

The browser suite runs eight native setups with exact physical inventories
and shows the quest cards, An Evil Wound, The Last Bridge's burden, a Fell
Rider, Stricken Dumb, Race to Rivendell, the Ford and the victory, and the
loss at zero life, at 1280/390/320px; it checks all 30 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
