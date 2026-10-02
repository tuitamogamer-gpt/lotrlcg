# Published products and deck provenance

The snapshot was checked on 30 September 2026. Product identities and card
publication history are separate from gameplay scripting.

`src/data/products.json` covers the original FFG products, Revised Core Set,
the three repackaged cycles, all three repackaged Lord of the Rings Saga boxes,
the four separately sold Starter Decks, the Limited Edition Starter and the
48 physical Nightmare products. A Nightmare deluxe/core/saga box groups three
scenarios; a cycle’s six Nightmare Adventure Packs are separate products.
Unofficial A Long-extended Party products and RingsDB’s virtual Messenger of
the King hero conversions are excluded from this official product catalogue.
The catalogue also records seven promotional hero printings verified directly
against FFG event announcements, connected to existing canonical hero designs.

The [live RingsDB packs API](https://ringsdb.com/api/public/packs/) supplies
original names and pack codes. The
[live RingsDB cards API](https://ringsdb.com/api/public/cards/) supplies canonical
card codes and individual printed editions in `packs[]`. Reprint image codes
are recorded as provenance aliases, without creating new card designs.
RingsDB’s pack availability dates are not used as authoritative release dates:
some revised products have database dates that precede their physical release.

FFG’s [current game and rules page](https://www.fantasyflightgames.com/product/the-lord-of-the-rings-the-card-game/)
provides the original and revised official rules. The original product names
and Nightmare encounter symbols are also checked against the printed-card
definitions in the [OCTGN game repository](https://github.com/GeckoTH/Lord-of-the-Rings).
Every product record includes source URLs.

## Repackaged products

The following official announcements establish which original products were
combined. Hero Expansions contain player deckbuilding pools. Campaign Expansions
contain scenario cards and newly added campaign cards. The hero boxes supply
suggested lists to assemble; they are not sold as the four prebuilt Starter Decks.

- [Angmar Awakened](https://www.fantasyflightgames.com/en/news/2022/3/17/evil-reawakened/): The Lost Realm and six Angmar Awakened Adventure Packs.
- [Dream-chaser](https://www.fantasyflightgames.com/en/news/2023/3/2/a-high-seas-adventure/): The Grey Havens and six Dream-chaser Adventure Packs.
- [Ered Mithrin](https://www.fantasyflightgames.com/en/news/2024/2/22/into-the-wilds/): The Wilds of Rhovanion and six Ered Mithrin Adventure Packs.
- [The Fellowship of the Ring](https://www.fantasyflightgames.com/en/news/2022/7/14/the-bonds-of-fellowship/): The Black Riders and The Road Darkens.
- [The Two Towers](https://www.fantasyflightgames.com/en/news/2023/7/6/the-hand-and-the-eye/): The Treason of Saruman and The Land of Shadow.
- [The Return of the King](https://www.fantasyflightgames.com/en/news/2024/7/18/the-fate-of-middle-earth/): The Flame of the West and The Mountain of Fire.
- [The Dark of Mirkwood](https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/the-dark-of-mirkwood-scenario-pack/): The Oath and The Caves of Nibin-dûm from the Limited Collector’s Edition, with new campaign cards.

## Official Starter Deck recipes

The [official Starter Deck announcement](https://www.fantasyflightgames.com/en/news/2021/12/9/starting-the-journey/)
distinguishes the prebuilt decks and their extra deckbuilding cards. Exact
recipes were transcribed from the final page of each current official rules PDF:

- [Dwarves of Durin, MEC103](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec103_rules.pdf)
- [Elves of Lórien, MEC104](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec104_rules.pdf)
- [Defenders of Gondor, MEC105](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec105_rules.pdf)
- [Riders of Rohan, MEC106](https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec106_rules.pdf)

Each recipe has exactly three heroes and 50 playing cards. Additional physical
cards after the printed Halt divider are kept in `sideboard`, calculated from
RingsDB’s individual Starter Deck printing quantities after subtracting the
official recipe. They are never silently included in the playing deck.

The two additional prebuilt lists in the
[Limited Collector’s Edition announcement](https://www.fantasyflightgames.com/en/news/2018/6/21/there-and-back-again-1/)
are included as bundled decks. Their exact contents are reconstructed from the
consecutive printed deck groups in the
[pinned OCTGN set manifest](https://github.com/GeckoTH/Lord-of-the-Rings/blob/802f09c407e8b418c6fa59fd003bddfdc671e968/o8g/Sets/Two-Player%20Limited%20Edition%20Starter/set.xml),
cross-checked against current DragnCards printing records: numbers 1–33 are
Leadership/Spirit and 34–65 are Lore/Tactics. Each group contains three heroes
and 50 playing cards, with two Core Gandalf copies at #4 and #37 respectively.
RingsDB combines these Gandalfs into one quantity-four printing; each deck keeps
two copies. The Limited Starter has no extra sideboard cards. The descriptive
sphere titles identify the lists in the app; they are not separate retail products.

The four existing Core Set lists follow the printed single-sphere learning
recipes with app-specific titles. Their provenance explicitly says that the
cards are included in the Core Set. They are not the separately sold 2022
Starter Deck products.

`deckProductInfo` checks the full hero and card recipe before describing a list
as an official preconstructed deck. A modified list is described as assembled.
`cardProductInfo` reports first publication separately from subsequent printed
editions and repackaged boxes. Its `availableIn` reports card-design membership,
not stock status, availability for purchase, or sufficient quantities to buy a deck.

Regenerate product data with `node scripts/sync-products.mjs`, or provide raw
RingsDB API snapshots using `--cards PATH --packs PATH`. The raw cards input must
retain `packs[]` objects and their per-printing quantities. The clean public
catalogue is not a replacement for those raw printing records.

## Promotional artwork scope

Verified promotional identities are recorded as reprint availability on their
original hero. The printed hero identity, sphere and statistics must match the
canonical card; a different sphere version with the same name is not interchangeable.
FFG’s primary event sources verify the following printings:

- [Aragorn, Fellowship 2014](https://www.fantasyflightgames.com/en/ffg_blog/22030/original_content), Core Set Leadership hero.
- [Legolas, Fellowship 2015](https://www.fantasyflightgames.com/en/news/2015/10/30/join-the-fellowship/), Core Set Tactics hero.
- [Boromir and Faramir, Gen Con and Fellowship 2016](https://www.fantasyflightgames.com/en/news/2016/7/27/defend-against-the-siege-of-annuminas/), Tactics Boromir and Leadership Faramir. Their original FFG card/layout images were inspected to distinguish the exact versions.
- [Celeborn and Galadriel, Gen Con and Fellowship 2017](https://www.fantasyflightgames.com/en/news/2017/9/14/assault-on-dol-guldur/), Leadership Celeborn and Spirit Galadriel.
- [Éowyn, Fellowship 2018](https://www.fantasyflightgames.com/en/news/2018/8/24/the-woodland-realm/), Core Set Spirit hero.

The canonical card pool includes their gameplay designs once. All promotional
artwork scans, regional foil finishes, and event/accessory packaging variants are
not exhaustively imported as distinct image records. Other artwork-only variants
are not guessed from third-party lists. No additional gameplay card design is
introduced by an alternate-art printing.
