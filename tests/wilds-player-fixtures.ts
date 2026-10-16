import { base } from "./against-shadow-final-fixtures";
import { make } from "../src/game/core";
import { forOwner, playerOrder } from "../src/game/table";
import { WILDS_PLAYER as P } from "../src/game/wilds-player-support";
export {
  drownedPlayerAlly as wildsPlayerAlly,
  drownedPlayerHand as wildsPlayerHand,
  drownedPlayerAttach as wildsPlayerAttach,
} from "./drowned-player-fixtures";
import {
  drownedPlayerAlly as ally,
  drownedPlayerHand as hand,
  drownedPlayerAttach as attach,
} from "./drowned-player-fixtures";
export function wildsPlayerFixture(players = 1) {
  const s = base("mirkwood", players);
  const groups = [
    [P.brand, P.bard, "01001"],
    ["01006", "01007", "01012"],
    ["01002", "01005", "01009"],
    ["01003", "01008", "01011"],
  ];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes = groups[p].map((code) => ({
        ...make(s, code),
        resources: 10,
        phaseResourceIcons: ["leadership", "tactics", "spirit", "lore"],
      }));
      s.startingHeroes = s.heroes.map((u) => u.code);
      s.deck = Array(20).fill("01013");
    });
  return s;
}
/** Stable native-action scenes for browser verification; no response is pre-resolved. */
export function wildsPlayerBrowserCases() {
  const brand = wildsPlayerFixture(),
    brandHost = ally(brand, P.sentry),
    brandCard = hand(brand, P.hauberk);
  const trader = wildsPlayerFixture(),
    traderUnit = ally(trader, P.trader),
    traderFrom = ally(trader, P.warrior),
    traderTo = ally(trader, P.sentry),
    traderItem = attach(trader, traderFrom, P.bow);
  const king = wildsPlayerFixture(),
    kingHost = king.heroes[0],
    kingCard = attach(king, kingHost, P.king);
  attach(king, kingHost, P.hauberk);
  attach(king, kingHost, P.map);
  const kingAlly = hand(king, P.warrior);
  const necklace = wildsPlayerFixture(),
    necklaceCard = hand(necklace, P.necklace);
  necklace.encounterDeck = ["01092", "01089"];
  const traffic = wildsPlayerFixture(),
    trafficHost = traffic.heroes[0];
  attach(traffic, trafficHost, P.hauberk);
  const trafficAlly = ally(traffic, P.lookout);
  attach(traffic, trafficAlly, P.map);
  const trafficCard = hand(traffic, P.traffic);
  return {
    brand: {
      state: brand,
      source: brandCard.id,
      target: brandHost.id,
      expected:
        "Playing the first attachment offers Brand's optional draw; accepting draws one card and equips Sentry.",
    },
    trader: {
      state: trader,
      source: traderUnit.id,
      attachment: traderItem.id,
      from: traderFrom.id,
      target: traderTo.id,
      expected:
        "Native Trader action exhausts Trader then transfers the same Bow to Sentry without drawing for Brand.",
    },
    king: {
      state: king,
      source: kingHost.id,
      attachment: kingCard.id,
      ally: kingAlly.id,
      expected:
        "Native King action exhausts its attachment; the next Warrior of Dale costs zero and consumes the discount.",
    },
    necklace: {
      state: necklace,
      source: necklaceCard.id,
      expected:
        "Playing Necklace discards treachery then adds Dol Guldur Orcs with Necklace attached as guarded objective, without its When Revealed damage.",
    },
    traffic: {
      state: traffic,
      source: trafficCard.id,
      target: trafficHost.id,
      expected:
        "Playing Traffic adds exactly two resources to Brand and prohibits another copy this round.",
    },
  };
}
