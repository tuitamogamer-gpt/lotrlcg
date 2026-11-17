# The Siege of Annúminas

The 2016 Gen Con event scenario, later sold print-on-demand. It is in the
atlas as **The Siege of Annúminas** (`the-siege-of-annuminas`) in its
**standard game mode** (Q99.08), playable in classic solo and with one to four
local players. Easy mode adds the framework's resource (the scenario predates
official easy mode and marks no cards).

The epic multiplayer mode (Q99.09) needs three copies of the scenario and three
teams of up to four players at three stages at once; it is not playable on a
one-to-four player table and stays unsupported.

An army from Angmar marches on the Dúnedain capital. The players rebuild the
defenses while the city strength of Annúminas holds, defend the city against
the host of Angmar, and lead a sortie against Lieutenant of Angmar. The city
strength, 20 at the start, falls with every enemy, siege engine and eliminated
player; at 0 the players lose.

## Sources and corrections

- The recipe matches
  [Hall of Beorn](https://hallofbeorn.com/LotR/Scenarios/The-Siege-of-Ann%C3%BAminas):
  its 48 encounter cards include both setup cards, so standard mode uses 47
  (without the Epic Multiplayer Mode card), the 1A–3A quest deck and the three
  rules cards. Hall of Beorn's community rating of 8.3 gives an atlas
  difficulty of 8. The catalog names the recipe "Standard The Siege of
  Annúminas"; the coverage audit maps it to the scenario.
- One immutable snapshot: `src/data/pending/the-siege-of-annuminas-import.json`
  (Q99.08, SHA-256
  `ec9d070e27eb5a43f9d495f28e12e6c39ae0448208a4090340930c98ec3562c4`);
  `tests/annuminas-source-quantities.json` keeps every card's quantity.
- `tests/annuminas-art.json` pins all **35 faces** (28 cards; the setup card,
  the quest cards and the rules cards have two faces). The rules sheet (pages
  1–5 and the questions) is complete.
- **Corrections from the reviewed scans:** the catalog's card text drops the
  diacritics (Annúminas, Dúnedain, Carn Dûm); Siege Tunnel "At the end of the
  round", Warg of Carn Dûm "character", Caught in the Press "you control, or",
  Orc of Angmar's shadow "until end of round", Savage Werewolf's shadow period
  and Weary Warriors' "+1 [attack]". The rules cards' text comes from the scans.

## Setup and stages

Setup (Standard Game Mode and 1A): Annúminas is added to the staging area with
a city strength of 20. Lieutenant of Angmar, Battering Ram, Enemy Camp, Siege
Tunnel, each Host of Angmar and each Dúnedain of Annúminas are set aside. Each
player adds a different location from the encounter deck to the staging area:
the first player's is Gate of Annúminas, and the other players choose theirs
once the opening hands are kept.

| Stage                      | Quest points | Rules                                                                                                                                                                                                                                                         |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1A/1B Rebuild the Defenses | —            | At the beginning of each round a resource is placed here; at 4 the players advance. At the end of the round, 10 progress here can be removed to raise the city strength by 10.                                                                                |
| 2A/2B Defend the City      | 50           | Before 2A: the Dúnedain and X Hosts of Angmar (players − 1, at least 1) join the deck. 2A stages X enemies. 10 fewer quest points per Host in the victory display; after the commitments the strongest staged enemy attacks each player; each player heals 1. |
| 3A/3B Lead the Sortie      | —            | 3A adds Battering Ram and Lieutenant of Angmar; each other player reveals a card. No progress while Battering Ram is in play. With Lieutenant of Angmar in the victory display at the end of the round, the players win.                                      |

**End of the round**, in order: Annúminas takes 1 damage for each enemy in
play; Battering Ram gains a resource and deals 1 more than its resources;
each City Wall gains a resource and at 3 is discarded for 4 damage and a
reveal; Siege Tunnel discards cards until an enemy, which is staged;
Lieutenant of Angmar returns to the staging area and attacks the first player;
then 1B's and 2B's Responses and 3B's victory check.

The scenario panel shows the side and its rule, the city strength, 1B's
resources, the Hosts in the victory display at 2B and where Lieutenant of
Angmar is.

## Encounter cards

| Card                   | Behaviour                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lieutenant of Angmar   | Immune; engagement 0; no damage while the main quest has fewer than 10 progress; at the end of the round returns to the staging area and attacks the first player. Victory 4. |
| Host of Angmar         | Archery 2; immune. After it destroys a character: remove 2 progress from the main quest, or it returns to the staging area. Victory 4.                                        |
| Battering Ram          | Immune; X threat (1 + resources); end of the round as above. Travel: each player reveals a card. Victory 5.                                                                   |
| Enemy Camp             | Immune. In standard mode no hero lies under a stage 3, so its end-of-round effect does nothing. Travel: each player reveals a card. Victory 5.                                |
| Siege Tunnel           | Immune; end of the round as above. Travel: each player reveals a card. Victory 5.                                                                                             |
| Dúnedain of Annúminas  | Surge. When revealed, any player may spend 1 resource to take control of it (Ranged, Sentinel); otherwise it is discarded. Shadow: the defender readies with +2 defense.      |
| Gate of Annúminas      | X threat (1 + enemies in play). Travel: each player engages an enemy in the staging area (no travel with fewer enemies than players).                                         |
| City Wall              | Immune; end of the round as above. Travel: reveal the top card.                                                                                                               |
| Arnor Battlefield      | Non-unique enemies get -5 engagement cost while it is staged. Travel: each player deals 1 damage to a hero.                                                                   |
| Hills of Evendim       | 'When revealed' effects cannot be canceled while it is staged. Travel: discard until an enemy, which is staged.                                                               |
| Shores of Lake Nenuial | No progress on other staged locations while it is staged. Travel: each player raises his threat by 2.                                                                         |
| Warg of Carn Dûm       | Surge. After it engages you: remove 1 progress, or exhaust a character.                                                                                                       |
| Orc of Angmar          | Archery 1. When it attacks: remove 1 progress, or +2 defense for the phase. Shadow: the defender gets -2 defense until the end of the round.                                  |
| Angmar Warg-rider      | Archery 1. After it engages you: remove 2 progress, or an immediate attack. Shadow: exhaust a character.                                                                      |
| Savage Werewolf        | After it destroys a character, 3 progress are removed. Shadow: an additional attack.                                                                                          |
| Vanguard of Carn Dûm   | No attachments; no more than 5 progress on the main quest a round while it is staged. Shadow: the defender cannot ready this round.                                           |
| The Hordes of Angmar   | Each player returns his highest-threat engaged enemy, or searches out an enemy that engages him. Shadow: a destroyed character reveals the top card.                          |
| Sorcery of Carn Dûm    | Doomed 1. Each player discards his highest cost attachment or assigns X damage (X: his attachments). Shadow: discard an attachment.                                           |
| Caught in the Press    | Each player: 1 damage to each questing character, or -1 willpower for them this phase. Shadow: remove 2 progress, or the attacker returns after the attack.                   |
| Weary Warriors         | Each player damages a hero, which leaves the quest; damaged characters' text boxes are blank this round. Shadow: +1 attack (+2 if the defender is damaged).                   |

Interpretations:

- **Standard mode** reads "each stage" and "each team" as the one quest deck
  and its players; 3B's Response (an enemy "at another stage") and Enemy
  Camp's heroes under stage 3 never apply.
- **The Lieutenant's move** returns him from a player to the staging area
  before his immediate attack against the first player.
- **Archery** totals the Hosts', Orcs' and Warg-riders' values at the
  beginning of each combat phase; the players divide it.
- **Choices with a progress cost** offer only the other option when there is
  no progress to remove.

## Verification

```sh
npm run test:engine
npm run test:annuminas-simulation
npm run build
npm run test:browser-annuminas
npm run audit:rules
```

The focused suite (`tests/annuminas.test.ts`, 9 tests) covers setup for one to
four players, 1B's resources and Response, the reinforcements and 2A, the
city's damage and the loss, 2B's quest points, attacks and healing, 3A and
3B, the Lieutenant, every siege location, enemy, treachery and shadow, the
Dúnedain, saves and the scenario panel. The source test pins the snapshot,
the quantities and all 35 faces.

The complete-game matrix (`npm run test:annuminas-simulation`, in two CI
partitions: complete games and late-game starts) plays 34 games (3,149
actions) with exact save restoration after every action, physical
conservation (the set-aside cards, a Dúnedain of Annúminas waiting for a
payment and the treacheries being resolved) and private-view checks, and 14
exact paced/immediate terminal-state comparisons. From setup, the starter
decks lose all 14 games, at Rebuild the Defenses in normal mode and by Defend
the City in easy mode. The 10 games started at the end of Defend the City,
with two Hosts of Angmar in the victory display and 30 progress on 2B, reveal
Lead the Sortie and lose to Battering Ram and Lieutenant of Angmar; the 10
started in the last fight at 3B, with Battering Ram explored, 10 progress on
the stage and Lieutenant of Angmar engaged with 3 hit points left, are won 9
times. At 3B the policy keeps 10 progress on the stage, so that the Lieutenant
can take damage, and the player engaged with him commits nobody to the
quest.

The browser suite runs eight native setups (both difficulties, one to four
players) with exact physical inventories and shows the quest cards, 1B's
Response, 2B's attacks, the Dúnedain, The Hordes of Angmar, archery, 3B with
Battering Ram and the Lieutenant, the win and the fallen city at
1280/390/320px; it checks all 35 faces.

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
