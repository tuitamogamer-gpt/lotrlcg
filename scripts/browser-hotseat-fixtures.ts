import { mkdirSync, writeFileSync } from "node:fs";
import { STARTERS } from "../src/game/cards";
import { createGame, applyAction, validateSave } from "../src/game/engine";
import { selectSeat, syncSeat, eachSeat } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";
const config = [
  { hero: "01001", deckId: "leadership" },
  { hero: "01007", deckId: "spirit" },
  { hero: "01005", deckId: "tactics" },
];
const create = (campaign = false) => {
  const d = STARTERS[0];
  let s = createGame(99, d.cards, d.heroes, d.id, {
    seats: config,
    playMode: campaign ? "campaign" : "normal",
  });
  while (s.phase === "setup") s = applyAction(s, { type: "KEEP" });
  return s;
};
const unit = (s: GameState, code: string, owner = 0): Unit => ({
  id: `c${s.nextId++}`,
  code,
  owner,
  damage: 0,
  progress: 0,
  resources: 0,
  exhausted: false,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
const round = create();
round.encounterDeck = Array(40).fill("01099");
const defense = create();
defense.phase = "defense";
defense.staging = [];
defense.encounterDeck = [];
selectSeat(defense, 1);
defense.engaged = [unit(defense, "01089", 1)];
defense.table!.turn = 1;
defense.table!.first = 1;
const ranged = create();
ranged.phase = "attack";
ranged.staging = [];
ranged.engaged = [unit(ranged, "01082")];
const support = create();
support.heroes[0].resources = 5;
support.hand = [unit(support, "01026")];
const campaign = create(true);
campaign.phase = "staging";
campaign.stage = 3;
campaign.branch = "beorn";
campaign.progress = 9;
campaign.staging = [];
eachSeat(campaign, () => {
  sCommit(campaign);
});
function sCommit(s: GameState) {
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
}
const fallenCampaign = structuredClone(campaign);
selectSeat(fallenCampaign, 1);
fallenCampaign.heroes = [];
fallenCampaign.discard.push("01007");
fallenCampaign.table!.seats[1].eliminated = true;
selectSeat(fallenCampaign, 0);
const fixtures = { round, defense, ranged, support, campaign, fallenCampaign };
for (const s of Object.values(fixtures)) {
  syncSeat(s);
  if (!validateSave(s)) throw Error("Invalid fixture");
}
mkdirSync("output/hotseat", { recursive: true });
writeFileSync("output/hotseat/fixtures.json", JSON.stringify(fixtures));
