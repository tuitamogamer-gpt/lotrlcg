# The Hills of Emyn Muil rules support

The original quest is automated in normal and easy mode. Its Nightmare variant remains imported reference content.

## Primary sources

- [FFG rulesheet](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/the_hills_of_emyn_muil_rulesheet.pdf), also available as [the original FFG PDF mirror](https://hallofbeorn-resources.s3.amazonaws.com/Images/LotR/Rules/MEC05.pdf). This confirms difficulty 4, the three encounter sets and all three victory requirements: one quest progress, at least 20 victory points and no Emyn Muil locations in play.
- [FFG Easy Mode](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_easy_mode.pdf), p. 2: remove East Wall of Rohan 2, Impassable Chasm 2, Rockslide 2 and Orc Horse Thieves 1. The shared Core sets additionally remove Chieftain Ufthak 1, Dol Guldur Beastmaster 1, Necromancer's Pass 1, The Necromancer's Reach 2, Eastern Crows 2 and Evil Storm 1. Together these remove 15 cards.
- [FFG Rules Reference](https://images-cdn.fantasyflightgames.com/filer_public/90/19/90191e4e-a341-4379-b398-5963b7a87ebf/mec01_online_only_rules_reference_for_website.pdf), entry **Blank**: blanking removes printed abilities, keywords and traits; text gained from another source is retained. The printed title, type and physical attachment remain.
- [FFG FAQ 1.9](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/lotr_faq_19_printer_friendly.pdf), section 1.22: a card is revealed only when the effect explicitly uses a form of “reveal.” Section 1.23 covers objectives that become attachments. The Amon Lhaw FAQ states that blanking never discards an already attached card for losing its attachment restriction.
- Original printed card definitions, UUIDs and exact normal/easy recipes are preserved from the pinned catalog sources in [CONTENT-IMPORT.md](CONTENT-IMPORT.md).

## Implemented rules

- All 12 original encounter designs and the double-sided quest are registered. Setup stages Amon Hen and Amon Lhaw and shuffles the remaining deck: 53 normal cards or 38 easy cards, regardless of player count. Both starting locations have threat equal to twice the number of players in the game.
- Victory requires one quest progress, 20 victory points and no Emyn Muil-trait locations in either staging or the active slot. Unrelated Core locations and enemies may remain. Pending encounter reveals and travel effects finish before victory is checked. Explored victory locations are removed from the encounter discard cycle.
- Amon Hen prevents event actions and event responses, while hero responses remain possible. Amon Lhaw blanks attachment text consistently across statistics, resource icons, granted traits/keywords, actions, Conditions, Restricted limits and quest exhaustion. Attachments remain attached, and their text returns when Amon Lhaw leaves the active slot. Losing an attachment's health bonus can immediately destroy a lethally damaged character.
- The East Wall of Rohan adds two matching resources to the normal play cost of non-Rohan characters. Rauros Falls requires every eligible ready character to be selected for the quest; exhausted or prohibited characters are excluded. Orc Horse Thieves count staging locations for attack, and The Outer Ridge adds one threat to staging locations.
- The first treachery revealed each quest phase gains Surge if no location is in staging at that moment, even when its when-revealed effect is canceled. Impassable Chasm can add another Surge when it moves no active location; otherwise it clears that location's progress and returns it with attachments intact.
- Rockslide damages all committed characters across players; its shadow makes the attack undefended. Slick Footing removes one available progress from every location in play, then mills each player's deck by the total removed.
- The Highlands reveals an encounter as its travel cost before entering the active slot. The Shores of Nen Hithoel requires the first player to discard an event, which is a discard rather than event play. The North Stair returns the top encounter-discard card and resolves its when-revealed effect. That card is moved rather than revealed, so it does not trigger printed Surge/Doomed, Thalin or cancellation responses requiring a just-revealed card.
- The shadows on Rauros Falls, The Outer Ridge and The Shores of Nen Hithoel return the attacker to staging after damage, preserving its damage and clearing its shadow cards.

## Verification

`node --import tsx --test tests/emyn-muil.test.ts` verifies encounter recipes for 1–4 players in both modes, the independent victory requirements, timing of victory, all location rules, global damage/discards, cancellation and Surge, mandatory quest selection, attachment blanking/restoration/death, travel costs and every new shadow.
