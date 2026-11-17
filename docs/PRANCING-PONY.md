# Murder at the Prancing Pony

The 2015 Fellowship event scenario, later sold print-on-demand (Q99.07,
easy E99.07). It is in the atlas as **Murder at the Prancing Pony**
(`murder-at-the-prancing-pony`), playable in classic solo and with one to four
local players, in normal and easy mode.

A guest has been murdered at The Prancing Pony. One of five Suspects and one of
five Hideouts are set aside facedown at setup; the others form the
**Investigation deck**, which the players may look at only through the new
**Investigate** keyword and a few card effects. At Running out of Time the
first player **makes the accusation**, naming a Suspect and a Hideout; the real
ones come out, and the players win at Apprehending the Killer once no Suspect
remains in play.

## Sources and corrections

- The recipes match
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/Murder-at-the-Prancing-Pony):
  50 encounter cards (40 in easy mode), 3 quest cards and the two rules cards.
  Hall of Beorn's community rating of 7.6 gives an atlas difficulty of 8.
- **Easy mode** keeps fewer copies of Taken by Surprise (1), Dark Alley (1),
  Market Square (2), Greenway Footpad (2), Chetwood Outlaw (2), Smoke and
  Mirrors (1) and Deadly Accusations (1).
- One immutable snapshot:
  `src/data/pending/murder-at-the-prancing-pony-import.json` (Q99.07 and
  E99.07, SHA-256
  `5fe269f753bb187cb48b0059b111463cbb13a351ff489562214821618d1d5827`);
  `tests/prancing-pony-source-quantities.json` keeps every card's quantity in
  both recipes.
- `tests/prancing-pony-art.json` pins all **36 faces** (31 cards; the quest
  cards and the rules cards have two faces). Page 1 of the rules is not in the
  source; pages 2-5 hold the Investigation deck, the Investigation List,
  Investigate X, immunity, the accusation and the list itself.
- **Completed and corrected from the reviewed scans:**
  - The catalog leaves the three quest cards and the rules sheet blank; their
    text comes from the scans, with 1B's 12 quest points (2B and 3B have none).
  - Victory points the catalog leaves out: every Suspect and Hideout 5, The
    Prancing Pony 2, Bill Ferny 3.
  - Smoke and Mirrors has no Surge keyword (the catalog adds one; Hall of Beorn
    and the scan agree) and adds the discarded cards' [threat].
  - Typos: Susie the Spider "1 other Brigand enemy", Johnny Goblin-fingers,
    Old Orc-eyes "shadow card", "The Prancing Pony", Ramshackle Manor "reduce",
    Old Warehouse "2 additional cards", Bree-land Informant, Greenway Footpad
    "by 2, or", Chetwood Outlaw "optionally engage", Hired Muscle "attached",
    "+1 [defense]" and "the bottom card".
  - Paragraphs follow the cards; straight quotes replace the catalog's.

## Setup and stages

Setup (1A): the 5 Suspects and 5 Hideouts are taken from the encounter deck; 1
random Suspect and 1 random Hideout are set aside facedown, out of play. The
other 4 Suspects, the other 4 Hideouts and each Taken by Surprise are shuffled
into the Investigation deck. The Prancing Pony is the active location and 1
Ramshackle Manor is added to the staging area.

| Stage                         | Quest points | Rules                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1A/1B Investigating the Crime | 12           | No more than 4 progress can be placed on this stage each round. At the beginning of each quest phase, each player raises his threat by 2 or reveals an additional encounter card this phase.                                                                                               |
| 2A/2B Running out of Time     | —            | When Revealed: the discard pile is shuffled in and cards are discarded until X locations (X players) come out into the staging area. An unsuccessful quest removes a random Investigation card unseen; after progress from a successful quest, the first player reveals a card or accuses. |
| 3A/3B Apprehending the Killer | —            | When Revealed: each player besides the first searches the encounter deck and discard pile for a Brigand enemy. Investigate is ignored; each Suspect engages the first player at the beginning of the encounter phase and cannot take damage while a Hideout is in play. No Suspect: win.   |

**Investigate X.** When an active location with Investigate is explored, the
first player shuffles the Investigation deck and looks at the top X cards,
which go back in the same order. At 2B the explored location's Investigate
resolves before the stage's second Forced effect.

**The Investigation List.** Every Suspect and Hideout the players have seen
(looked at, or come into play) is checked off on the scenario panel; cards
removed unseen are not.

**The accusation.** The first player names 1 Suspect and 1 Hideout; the
facedown pair is revealed and added to the staging area. If either name is
wrong, each named card that is not already in play is searched out of the
Investigation deck and added to the staging area, and each player raises his
threat by 3. Then the players advance to 3A.

The scenario panel shows the current side and its rule, the size of the
Investigation deck and the cards removed from the game, the Investigation List
with the checked Suspects and Hideouts, whether the pair still lies facedown or
the accusation's result, and at 1B the progress placed on the stage this round.

## Encounter cards

| Card                | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suspects            | Victory 5; cannot have attachments. Todd the Troll's excess combat damage raises the defending player's threat; Susie the Spider has X threat (Brigands in play) and takes no damage while another Brigand is in play; Wolf-pelt Jake returns to the staging area after destroying an ally; Johnny Goblin-fingers makes the defending player discard a random card and raise his threat by its cost; Old Orc-eyes attacks again, without a shadow card, after a blank shadow.          |
| Hideouts            | Victory 5; immune to player card effects. In the victory display: Bill Ferny's House makes Suspects and their shadows immune; Staddle Hiding Hole lets only the engaged player attack a Suspect; Combe Storehouse makes a Suspect attack when it engages; Archet Trading Post caps a Suspect's damage at 5 a round; Chetwood Campsite gives +1 threat, attack and defense. Travel: each searches for its enemy (Bill Ferny also in the victory display; Greenway Footpad is revealed). |
| Taken by Surprise   | When looked at in the Investigation deck: the discard pile is shuffled in, cards are discarded until an enemy, which engages the first player; Taken by Surprise is removed from the game.                                                                                                                                                                                                                                                                                             |
| The Prancing Pony   | Victory 2. Explored: the first player looks at the top 2 Investigation cards, or each player draws 2.                                                                                                                                                                                                                                                                                                                                                                                  |
| Ramshackle Manor    | Investigate 2. Player card threat reduction is reduced to 1. Travel: each player raises his threat by 1.                                                                                                                                                                                                                                                                                                                                                                               |
| Dark Alley          | Investigate 3. Enemies in the staging area cannot take damage. Travel: cards are discarded until an enemy, which is staged.                                                                                                                                                                                                                                                                                                                                                            |
| Market Square       | Investigate 2. Progress a player places on a staging location raises his threat by 1. Travel: each player spends 1 resource.                                                                                                                                                                                                                                                                                                                                                           |
| Old Warehouse       | Investigate 1: look at 2 more cards, or each player reduces his threat by 3. Travel: reveal the top encounter card.                                                                                                                                                                                                                                                                                                                                                                    |
| Village Stable      | Investigate 1. Response: a looked-at Suspect or Hideout is added to the staging area and Village Stable to the victory display. Travel: each player discards a random card.                                                                                                                                                                                                                                                                                                            |
| Bill Ferny          | Victory 3; no optional engagement. The first treachery revealed each round gains doomed 1 and cannot be canceled. Shadow: raise your threat by 4, or the attack is undefended.                                                                                                                                                                                                                                                                                                         |
| Bree-land Informant | Response after a blank shadow: raise your threat by 1 and spend 1 resource to look at the bottom Investigation card; then it is discarded.                                                                                                                                                                                                                                                                                                                                             |
| Lawless Ruffian     | +2 attack while engaged with a player at 35 threat or more. Shadow: an additional attack.                                                                                                                                                                                                                                                                                                                                                                                              |
| Greenway Footpad    | When Revealed: each player raises his threat by 2, or it attacks the first player. Shadow: +1 attack (+2 at 35 threat).                                                                                                                                                                                                                                                                                                                                                                |
| Chetwood Outlaw     | Optional engagement raises your threat by 4. Shadow: raise your threat by 2, or the attacker returns to the staging area after the attack.                                                                                                                                                                                                                                                                                                                                             |
| Hired Muscle        | Surge. Attached to a Brigand enemy (not a Suspect) without one, which returns to the staging area: +1 threat, attack and defense; when it is defeated, look at the bottom Investigation card.                                                                                                                                                                                                                                                                                          |
| Smoke and Mirrors   | Discard the top X cards (1 more than the active Investigate value); their threat joins the staging area for the phase. Shadow: discard an attachment you control.                                                                                                                                                                                                                                                                                                                      |
| Rising Body Count   | Each player raises his threat by 2, or it is shuffled into the Investigation deck. Shadow: if the attack destroys a character, the same choice for you.                                                                                                                                                                                                                                                                                                                                |
| Deadly Accusations  | Each player raises his threat by 1 more than the active Investigate value. Shadow: +X attack (the Investigate value).                                                                                                                                                                                                                                                                                                                                                                  |

Interpretations:

- **Choices for the players** (Greenway Footpad's and Rising Body Count's When
  Revealed) are made by the first player; shadow choices by the defending
  player; 1B's choice by each player.
- **The accusation's names** may include cards already checked off; the
  policy names the cards the players have not ruled out.
- **Bill Ferny** marks the first treachery revealed in a round while he is in
  play; only that treachery's effects are protected from cancellation.
- **Village Stable** goes from the discard pile to the victory display when
  its Response is used.

## Verification

```sh
npm run test:engine
npm run test:prancing-pony-simulation
npm run build
npm run test:browser-prancing-pony
npm run audit:rules
```

The focused suite (`tests/prancing-pony.test.ts`, 13 tests) covers setup in
both difficulties for one to four players, Investigate and its modifiers, The
Prancing Pony and Taken by Surprise, 1B's choice and progress limit, 2A, 2B's
failed quest and its choice, right, wrong and half-right accusations, 3A and
3B, the Hideouts in the victory display and their Travel effects, every
Suspect, every encounter card, shadow and treachery, saves and the scenario
panel. The source test pins the snapshot, the quantities of both recipes and
all 36 faces.

The complete-game matrix (`npm run test:prancing-pony-simulation`, in two CI
partitions: complete games and late-game starts) plays 40 games (4,523
actions) with exact save restoration after every action, physical
conservation (the facedown pair, the Investigation deck, the cards removed from
the game and the treacheries being resolved) and private-view checks, which
also swap the Investigation deck's order and the facedown Suspect, and 16 exact
paced/immediate terminal-state comparisons. From setup, the starter decks lose
all 14 games at Investigating the Crime, where the 4-progress limit and the
extra reveals wear them down. The 6 games started at 2B with every card but the
facedown pair already seen make a correct accusation once; the 10 started at 3B
after a correct accusation lose to the Suspect and its Hideout; the 10 started
in the last fight, with the Hideout explored and the Suspect at 3 hit points,
are won 9 times. At 3B with no Hideout left in play, the policy commits only
enough willpower to match the staging area and keeps the rest back to attack.

The browser suite runs eight native setups (both difficulties, one to four
players) with exact physical inventories and shows the quest cards, The
Prancing Pony's choice, the Investigation List, 1B's choice, Old Warehouse,
Village Stable, the accusation (2B's choice, the named Suspect and Hideout, a
correct and a wrong accusation), 3B, the win, Greenway Footpad and Taken by
Surprise at 1280/390/320px; it checks all 36 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
