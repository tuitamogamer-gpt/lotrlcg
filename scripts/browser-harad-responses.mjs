import assert from "node:assert/strict";
import { card } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { activeSeat, seatView, selectSeat } from "../src/game/table.ts";
import { HARAD_PLAYER as P } from "../src/game/harad-player-support.ts";
import {
  haradPlayerAlly as ally,
  haradPlayerHand as hand,
  haradPlayerAttach as attach,
} from "../tests/harad-player-fixtures.ts";

/** Real quest, defense, engagement and staging controls, with saved optional responses. */
export async function runHaradResponses(
  p,
  {
    fixture,
    load,
    shot,
    choose,
    saved,
    reviewedState,
    resume,
    width,
    boardCard,
  },
) {
  async function defend(enemy, hero) {
    await boardCard(p, enemy.id)
      .getByRole("button", { name: "Defend", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: card(hero.code).name, exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
  }
  async function commit(hero) {
    await p
      .getByRole("button", {
        name: `Commit ${card(hero.code).name}`,
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .last()
      .click();
    await reviewedState(p);
  }

  let s = fixture();
  s.phase = "quest";
  let gimli = s.heroes[0],
    legolas = s.heroes[1];
  gimli.exhausted = true;
  const discarded = hand(s, "01050"),
    kept = hand(s, "01050");
  await load(p, s);
  await commit(legolas);
  s = await saved(p);
  assert.match(s.choice.title, /Legolas/);
  assert.equal(get(s, legolas.id).committed, true);
  await shot(p, "legolas-native-commit-optional-response", width);
  await choose(p, gimli.id);
  s = await saved(p);
  assert.match(s.choice.title, /hand to discard/);
  await resume(p);
  s = await saved(p);
  assert.ok(s.choice.options.some((o) => o.id === discarded.id));
  await shot(p, "legolas-saved-physical-discard-cost-choice", width);
  await choose(p, discarded.id);
  s = await saved(p);
  assert.equal(get(s, gimli.id).exhausted, false);
  assert.equal(get(s, gimli.id).tempWill, 1);
  assert.ok(s.hand.some((u) => u.id === kept.id));
  assert.ok(!s.hand.some((u) => u.id === discarded.id));
  assert.equal(s.discard.filter((code) => code === "01050").length, 1);
  await shot(p, "legolas-paid-discard-readies-gimli-plus-willpower", width);

  s = fixture();
  s.phase = "defense";
  gimli = s.heroes[0];
  legolas = s.heroes[1];
  legolas.exhausted = true;
  let enemy = make(s, "01089");
  s.engaged = [enemy];
  await load(p, s);
  await defend(enemy, gimli);
  s = await saved(p);
  assert.match(s.choice.title, /Gimli/);
  assert.equal(get(s, gimli.id).resources, 10);
  await shot(p, "gimli-native-defender-optional-own-resource", width);
  await resume(p);
  await choose(p, legolas.id);
  s = await saved(p);
  assert.equal(get(s, gimli.id).resources, 9);
  assert.equal(get(s, legolas.id).exhausted, false);
  assert.equal(get(s, legolas.id).tempAttack, 1);
  assert.equal(get(s, gimli.id).exhausted, true);
  await shot(p, "gimli-paid-own-pool-readies-legolas-plus-attack", width);

  s = fixture(2);
  s.phase = "encounter";
  const event = hand(s, P.wellWarned);
  enemy = make(s, "01089");
  enemy.tempThreat = 7;
  s.staging = [enemy];
  selectSeat(s, 1);
  s.table.turn = 1;
  await load(p, s);
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Engage", exact: true })
    .click();
  await reviewedState(p);
  s = await saved(p);
  assert.match(s.choice.title, /Well Warned/);
  assert.equal(activeSeat(s), 0);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === enemy.id));
  await shot(p, "well-warned-remote-engagement-caster-response", width);
  await resume(p);
  await choose(p, event.id);
  s = await saved(p);
  assert.equal(seatView(s, 1).threat, 18);
  assert.equal(seatView(s, 0).threat, 20);
  assert.ok(seatView(s, 0).discard.includes(P.wellWarned));
  await shot(p, "well-warned-printed-threat-reduces-engaged-player", width);

  s = fixture();
  s.phase = "defense";
  gimli = s.heroes[0];
  const shield = attach(s, gimli, P.shield);
  enemy = make(s, "01082");
  s.engaged = [enemy];
  assert.equal(stats(s, gimli).defense, 3);
  await load(p, s);
  await defend(enemy, gimli);
  s = await saved(p);
  assert.match(s.choice.title, /Gimli/);
  await choose(p, "skip");
  s = await saved(p);
  assert.match(s.choice.title, /Dwarven Shield/);
  assert.equal(get(s, gimli.id).damage, 3);
  await shot(p, "dwarven-shield-after-actual-enemy-attack-damage", width);
  await resume(p);
  await choose(p, "use");
  s = await saved(p);
  assert.equal(get(s, gimli.id).resources, 11);
  assert.equal(
    get(s, gimli.id).attachments.find((a) => a.id === shield.id).exhausted,
    true,
  );
  await shot(p, "dwarven-shield-exhausted-surviving-hero-resource", width);

  s = fixture();
  s.phase = "quest";
  gimli = s.heroes[0];
  const bounder = ally(s, P.bounder),
    river = make(s, "02017");
  river.progress = 2;
  s.staging = [river];
  s.victoryCards = ["09014"];
  s.encounterDeck = ["02023", "01099", "01099"];
  await load(p, s);
  await commit(gimli);
  s = await saved(p);
  assert.ok(s.choice.options.some((o) => o.id === `bounder-${bounder.id}`));
  assert.equal(s.threat, 21, "Doomed resolves before the cancellation window");
  await shot(
    p,
    "halfling-bounder-side-quest-enables-reveal-cancellation",
    width,
  );
  await resume(p);
  await choose(p, `bounder-${bounder.id}`);
  s = await saved(p);
  assert.equal(get(s, bounder.id), undefined);
  assert.ok(s.discard.includes(P.bounder));
  assert.ok(s.encounterDiscard.includes("02023"));
  assert.equal(get(s, river.id).progress, 2);
  assert.ok(s.staging.some((u) => u.code === "01099"));
  assert.equal(s.threat, 21);
  await shot(
    p,
    "halfling-bounder-discard-cancels-when-revealed-keeps-surge",
    width,
  );
}
