# The Dark of Mirkwood campaign

Campaign mode for The Dark of Mirkwood (2022): its rulebook (MEC102,
"Campaign Mode", page 7) plays The Oath and The Caves of Nibin-Dûm either as
**Parts 4 and 5 of the Mirkwood Paths campaign** begun in the Revised Core Set
(with the same Campaign Log), or as a **two-scenario mini campaign** that skips
the Core Set's three parts and begins at The Oath with a blank Campaign Log.
Both are part of the lobby's Mirkwood Paths campaign: after Escape from Dol
Guldur the campaign continues with The Oath, and the lobby's "A new campaign
begins with" choice starts the mini campaign.

## Sources

- The campaign rules are the Revised Core Set's (Learn to Play, Campaign
  Mode): the Campaign Log, fallen heroes, the +1 threat penalty for each
  replaced hero and the Campaign Pool. Its setup steps put boons and burdens
  with the Setup keyword into play and shuffle the Campaign Pool's encounter
  cards into each encounter deck. The Dark of Mirkwood's rulebook
  ([MEC102, hosted by Hall of Beorn](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC102.pdf))
  adds the two ways to play.
- All eleven cards (13 faces with the campaign cards' backs) were checked by
  eye against the DragnCards scans; they are added to
  `src/data/dark-mirkwood-campaign-cards.json` and pinned in
  `tests/dark-mirkwood-campaign-art.json`. Their burdens and campaign cards
  have their own encounter sets ("The Oath Campaign", "The Caves of Nibin-Dûm
  Campaign"), so they never join an ordinary game's encounter deck.
- The scans correct the catalog: Stalking Goblin has engagement cost 10 (the
  catalog has none), Ranger Sense's text says "Campaign Pool" (not "Pooll"),
  The Caves of Nibin-Dûm's resolution says "your next campaign", and its Setup
  quotes "No Time to Waste!" with double quotes.
- **The Oath's campaign card is a Forced effect.** The first printing (the
  DragnCards scan) says "Response: At the end of each round, place 1 resource
  token here." The card was reprinted with "Forced", and the designer ruled
  that it "should indeed be Forced instead of Response or players will never
  feel that mounting pressure"
  ([A Long-extended Party's semi-official Errata & FAQ](https://alongextendedparty.com/semi-official-errata-faq-1-10/),
  "Official Reprints" and item 3.390; Hall of Beorn notes the same). The
  registered text and the engine follow the reprint.
- **Mendor in Parts 4 and 5.** The same FAQ (item 3.372) records the
  designer's ruling for The Dark of Mirkwood as Parts 4 and 5: "I would start
  with Mendor in play for The Oath and Caves of Nibin-dum." Mendor begins both
  in play while he is in the Campaign Pool (Escape from Dol Guldur's first
  resolution option, or a previous campaign's legacy). Only Parts 1 and 2 print
  "If Mendor leaves play, the players lose the game"; his own text removes him
  from the game when he leaves play.

## The campaign rules

- **Chapters**: Mirkwood Paths is Passage Through Mirkwood, Journey Along the
  Anduin, Escape from Dol Guldur, The Oath (Part 4) and The Caves of Nibin-Dûm
  (Part 5). The mini campaign is The Oath (Part 1) and The Caves (Part 2). A
  lost chapter is replayed with the same log; the campaign is complete after
  The Caves of Nibin-Dûm.
- **The Campaign Pool** keeps the Core Set's boons and burdens: Mendor's
  Support joins each deck, Valor and Scarred return to their heroes, and
  Ungoliant's Swarm or Lingering Venom is shuffled into The Oath's and The
  Caves' encounter decks, as are The Dark of Mirkwood's own burdens once
  earned. Changes made during a game (a boon removed from the Campaign Pool, an
  Adaptation's Action used) are recorded when the scenario is won.
- **The next campaign**: Escape from Dol Guldur's Mendor legacy still opens
  the next Mirkwood Paths campaign with Mendor and his Support. The Caves of
  Nibin-Dûm's Ranger legacy offers each player Ranger Sense in whichever
  campaign the lobby starts next (see below).

## The Oath (Part 4, or Part 1 of the mini campaign)

| Card                                                                                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                                                                                              | Setup: each player in turn order chooses an Adaptation boon not yet chosen and attaches it to one of their heroes; Stalking Goblin is shuffled into the encounter deck. Forced: at the end of each round, 1 resource token is placed on the campaign card (the quest inspector shows the count). Resolution: Stalking Goblin and each attached Adaptation (with its player) join the Campaign Pool, and 6 or more tokens add Guilty Conscience.                                                                  |
| The Fervor of Lore, The Might of Tactics, The Power of Spirit, The Secret of Leadership (Adaptation boons) | Setup: attached to a hero (at each later setup the boon returns to a hero of the player who chose it). The hero gains the boon's resource icon. Actions, limit once per campaign and recorded in the Campaign Log: discard 3 chosen cards to heal all damage from a hero; deal 1 damage to the attached hero to deal 3 damage to an engaged enemy (not one immune to player card effects); exhaust the attached hero to place 3 progress on a location; spend 1 resource from the attached hero to ready a hero. |
| Stalking Goblin (burden enemy)                                                                             | Forced: after it engages a player, a Goblin Sniper comes from the encounter deck, then the discard pile, then the collection (a third copy) into the staging area, and the encounter deck is shuffled. Shadow: Stalking Goblin is added to the staging area.                                                                                                                                                                                                                                                     |

## The Caves of Nibin-Dûm (Part 5, or Part 2 of the mini campaign)

| Card                                       | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign card                              | Setup: each player adds "No Time to Waste!" to their hand after the starting hand (it stays through a mulligan) and it joins the Campaign Pool; Shiny Distraction is shuffled in with the Campaign Pool's burdens. Resolution: if the final threat of the player with the highest threat is under 40, a retired Ranger is rescued; the end-of-game dialog asks each player whether to add Ranger Sense to their deck and to the Campaign Pool. |
| "No Time to Waste!" (boon event, 4 copies) | When it is played, choose one Quest Action: remove it from the game and from the Campaign Pool to reduce each player's threat by 3 and reveal the top card of the encounter deck; or draw 1 card.                                                                                                                                                                                                                                              |
| Shiny Distraction (burden treachery)       | Surge. Doomed 1. When Revealed: each player in turn order may add 1 resource to each of their heroes' pools and raise their threat by 5.                                                                                                                                                                                                                                                                                                       |
| Guilty Conscience (burden treachery)       | Surge. When Revealed: attached to the hero with the highest printed threat cost (the first player breaks a tie). Forced: its controller raises their threat by 2 at the end of each round. Action: spend 2 resources from the attached hero's pool to discard it (to the encounter discard pile).                                                                                                                                              |
| Ranger Sense (boon event, 4 copies)        | When it is played, choose one Action: remove it from the game and from the Campaign Pool to look at the top 4 cards of your deck, add 1 to your hand and put the rest back in the chosen order; or draw 1 card.                                                                                                                                                                                                                                |

**The Ranger legacy.** "At the start of your next campaign, each player may
also shuffle 1 copy of Ranger Sense into their deck and add it to the Campaign
Pool." When the saved campaign is a finished Dark of Mirkwood campaign that
rescued the Ranger, the lobby lists each player with a checkbox, and the new
campaign (Mirkwood Paths, The Lord of the Rings, Angmar Awakened or
Dream-chaser) records the chosen players: their copy joins their deck at each
setup of that campaign until its first option removes it (recorded when that
scenario is won). Every campaign's Campaign Log notes the copies.

## Verification

```sh
node --import tsx --test tests/dark-mirkwood-campaign.test.ts tests/campaign.test.ts
npm run build
npm run test:browser-dark-mirkwood-campaign
```

`tests/dark-mirkwood-campaign.test.ts` (11 tests) covers the registered texts
and faces (the Forced errata, Stalking Goblin's stats, the burdens outside
ordinary games); the chapter order, the mini campaign's start at The Oath and
Part 4 after the Core Set's three parts with Mendor, Mendor's Support and
Ungoliant's Swarm (Mendor leaving play does not lose The Oath); The Oath's
setup with two players choosing different Adaptations and gaining their
resource icons, and its round-end tokens; The Oath's resolution with and
without Guilty Conscience and malformed logs; The Caves' setup with the
Campaign Pool's burdens, the returning Adaptation and "No Time to Waste!"
kept through a mulligan; each Adaptation's Action, its once-per-campaign limit
and its record in the next chapter; Stalking Goblin's Goblin Sniper from the
deck, the discard pile and the collection, and its shadow; Shiny Distraction
and Guilty Conscience (its round-end threat and its discard); "No Time to
Waste!" and its record; The Caves' resolution at 40 and 39 threat, the
completed campaign and Ranger Sense in a new campaign; and Ranger Sense's look
at the top 4 cards and its removal from the Campaign Pool. `tests/campaign.test.ts`
checks that The Oath follows Escape from Dol Guldur as Part 4 with Mendor.

The browser suite begins the mini campaign through the lobby, takes The Power
of Spirit at The Oath's setup and uses its Action through the hero's button,
records The Oath's resolution with 6 tokens (Guilty Conscience in the Campaign
Log), continues to The Caves of Nibin-Dûm with the burdens, the Adaptation and
"No Time to Waste!", plays it through its Play card button to reduce the threat
and reveal a card, records the Ranger Sense resolution through the end-of-game
dialog (no Continue campaign button follows), and starts a new campaign with
the lobby's Ranger Sense checkbox, at 1280, 390 and 320 pixels (30
checkpoints); it checks the 13 pinned faces. The Core campaign's browser script
(`npm run test:browser`) checks that The Oath follows Escape from Dol Guldur.
