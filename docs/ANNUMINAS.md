# The Siege of Annúminas

The 2016 Gen Con event scenario, later sold print-on-demand. It is in the
atlas as **The Siege of Annúminas** (`the-siege-of-annuminas`) in its
**standard game mode** (Q99.08), playable in classic solo and with one to four
local players, and in its **epic multiplayer mode** (Q99.09): three teams of
one to four local players, each at its own stage of the siege (see
[Epic multiplayer mode](#epic-multiplayer-mode)). Easy mode adds the
framework's resource (the scenario predates official easy mode and marks no
cards).

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
- `tests/annuminas-art.json` pins all **49 faces**: the 35 of the standard
  recipe (28 cards; the setup card, the quest cards and the rules cards have
  two faces) and the 14 of the epic multiplayer cards. The rules sheet (pages
  1–5 and the questions) is complete.
- **Epic multiplayer mode:** `src/data/annuminas-epic-cards.json` holds the
  Epic Multiplayer Mode setup card and the 1C–3C and 1E–3E quest cards (7
  cards), reviewed face by face against the DragnCards scans. The catalog
  recipe "Epic The Siege of Annúminas" (Q99.09) lists three copies of the
  standard encounter deck and three copies of each siege card (one
  Annúminas); it files 1C and 1E among the set-aside cards. The coverage audit
  maps it to the scenario.
- **Corrections from the epic scans:** Annúminas and Dúnedain of Annúminas
  keep their diacritics; Raise the Levee's back reads "Forced: At the
  beginning" (its front's misprint "from the the top" is not kept); Delay the
  Enemy's front ends "Shuffle the encounter deck." (missing from the catalog;
  its misprint "enocunter" is not kept); Rescue the Captives' and Stop the
  Attack's backs read "each player's threat" and "won the game"; the setup
  card's back has its four paragraphs without the flavour text.
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

## Epic multiplayer mode

On a hot-seat table, the lobby's **Epic multiplayer mode** switch (shown for
The Siege of Annúminas) starts three teams, each with the table's decks: one
to four players a team, three to twelve players in all. The teams play the
1A–3A, 1C–3C and 1E–3E quest decks (stages B, D and F on the back sides),
each with its own staging area, encounter deck (a full copy of the standard
deck), set-aside siege cards, players and victory display.

Setup (the Epic Multiplayer Mode card): the team at 1A adds Annúminas to its
staging area with a **city strength of 50**, shared by every team; the other
teams remove their copies. Each quest deck's own setup follows: 1A stages
Gate of Annúminas and a different location for each other player; at 1C each
player discards from the encounter deck until an enemy or location, which is
staged; at 1E the first player stages Vanguard of Carn Dûm and each other
player a different enemy. The Standard Game Mode card is not used: no
Dúnedain or Hosts join the decks at stage 2, and an eliminated player deals no
damage to Annúminas.

**Turns.** The teams take turns within each round. Every team resolves the
beginning of the round (A, then C, then E), then team A plays the round to its
end, then team C, then team E; the end of the round then resolves team by team
in stage order (2B before 2D before 2F), and the next round begins. Each turn
ends at a barrier where the team waits until the last team arrives; the table
heading names the active team and the panel lists every team's stage,
players, progress and enemies.

| Stage                     | Quest points | Rules                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1C/1D Raise the Levee     | —            | A resource at the beginning of each round; at 4 the team advances. Response at the end of the round: remove 10 progress, and the first player at each stage takes control of one of his team's set-aside Dúnedain of Annúminas.                                                   |
| 2C/2D Guard the Gate      | 50           | 2C stages X enemies (players − 1, at least 1). 10 fewer quest points per Host of Angmar in a victory display; 1 additional encounter card each quest phase. Response at the end of the round: choose a stage, whose players each add 1 resource to a hero.                        |
| 3C/3D Rescue the Captives | —            | 3C adds Enemy Camp and each other player reveals a card; each player at each stage puts a hero, its tokens and attachments discarded, facedown under the main quest at his stage. No progress while Enemy Camp is in play. Response and victory check as 3B.                      |
| 1E/1F Delay the Enemy     | —            | A resource at the beginning of each round; at 4 the team advances. Response at the end of the round: remove 10 progress, and the players at each other stage reveal 1 fewer encounter card during their next quest phase.                                                         |
| 2E/2F Man the Walls       | 50           | 2E as 2C. 10 fewer quest points per Host in a victory display. At the beginning of each round a set-aside Host of Angmar (its own team's first, else another stage's) enters this staging area. Response at the end of the round: choose a stage, whose players each draw 1 card. |
| 3E/3F Stop the Attack     | —            | 3E adds Siege Tunnel and each other player reveals a card. No progress while Siege Tunnel is in play. Response and victory check as 3B.                                                                                                                                           |

Across the teams:

- **Annúminas** takes 1 damage at the end of the round for each enemy at each
  stage (once a round, at stage A); City Wall, Battering Ram and the Hosts
  damage the same city. At 0 every team loses.
- **Stage 2** is defeated only at the beginning of the round, and only once
  every stage 2 is complete (a stage already at stage 3 counts as complete):
  then each stage 2 falls in turn, and the teams reveal 3A, 3C and 3E. 2B's
  Response becomes "choose a stage".
- **Host of Angmar** at stage 2: at the end of the round each Host in a
  staging area moves on, 2F to 2D and 2D to 2B, after the earlier stages have
  resolved their end of the round (so it moves once a round); from 2B it is
  discarded and Annúminas takes 9 damage. Its damage stays with it.
- **Lieutenant of Angmar** moves at the end of the round to the staging area
  with the lowest total threat at any stage (his own on a tie) and attacks
  that stage's first player.
- **Siege Tunnel**: each team discards from its own encounter deck until an
  enemy and stages it.
- **Enemy Camp**: at the end of the round a random facedown hero under each
  stage 3 is discarded (to its owner's discard pile); once Enemy Camp is in a
  victory display, each hero under each stage 3 returns to its owner's
  control.
- **3B, 3D and 3F's Response**: raise each player's threat at this stage by 1
  and reveal an encounter card to discard a non-unique enemy worth no victory
  points at another stage.
- **Victory displays** count together: a Host in any team's victory display
  lowers every stage 2, and with Lieutenant of Angmar in any victory display
  at the end of the round every team wins.
- **The last player at a stage eliminated** loses the game for every team.

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
- **Epic turns.** The three stages share one round; the engine plays it team
  by team (each team's game is its own state, held while another team plays),
  with the beginning of the round for every team first and the end of the
  round in stage order, as the Epic Multiplayer Mode card's example orders the
  Hosts' moves.
- **Effects on another stage** resolve at once when they only move cards
  (Hosts, Lieutenant of Angmar, Siege Tunnel's enemies, a discarded enemy, a
  Dúnedain of Annúminas); a choice by another stage's players (a hero to
  heal, a hero for a resource, a captive hero) and its card draws wait for
  that team's next turn, before anything else it does.
- **Lieutenant of Angmar moves once a round**: after moving to another stage
  he does not move again at that stage's end of the same round.
- **A moved card** keeps its damage and resources and leaves its shadow cards
  in its old stage's discard pile.
- **Man the Walls' Host** comes from its own team's set-aside cards first,
  then from the other stages' in stage order.
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
the quantities and all 49 faces.

The epic suite (`tests/annuminas-epic.test.ts`, 24 tests) checks the seven
epic cards against the scans and Q99.09 against three copies of the
standard recipe; setup for teams of one to four players at 1A, 1C and 1E;
the turn order and its barriers; stage 1's advance without reinforcements,
1D's and 1F's Responses, the stage 2 defeat at the beginning of the round
once every stage 2 is complete, 2B/2D/2F's chosen stage, 2D's additional
card, 2F's Host, the Hosts' moves and their 9 damage, the Lieutenant's move,
3C's captives and Enemy Camp, 3E's Siege Tunnel, 3B/3D/3F's discard at another
stage, the win and both losses for every team, save validation against 20
tamperings, the panel's team list, seeded games for teams of one to four
players, a full game from setup to stage 3 at every stage, and a retried epic
game with the same three teams.

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
players) with exact physical inventories and shows all nine quest cards (1C–3C
and 1E–3E at their teams' stages), 1B's Response, 2B's attacks, the Dúnedain,
The Hordes of Angmar, archery, 3B with Battering Ram and the Lieutenant, the
win, the fallen city and the epic panel at stage 3 (team E at 3F, the
Lieutenant at 3D, a captive hero) at 1280/390/320px. At 1280px it starts an
epic game of three two-player teams from the lobby's switch (which another
scenario does not offer), ends team A's first round on the table to begin team
C's turn, and shows every team winning with the Lieutenant in team A's victory
display; it checks all 49 faces (92 checkpoints).

The additive account-choice SQL migration is included; it has not been
applied to a hosted database.
