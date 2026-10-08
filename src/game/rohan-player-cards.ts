import { choosePlayerResponse } from "./player-ability-triggers";
import { playerCardImmune } from "./card-immunity";
import { globalPlayerOrder } from "./table";
import { spendResources } from "./core";
import { takePlayerDeck } from "./core";
// Exact Riders of Rohan main-list rules; original printings remain in the catalog.
// Primary list: https://images-cdn.fantasyflightgames.com/filer_public/1d/d6/1dd6170d-344d-4f9e-977b-7ef79c2d5c6c/mec106_rules.pdf
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  draw,
  eligiblePayers,
  fx,
  get,
  log,
  make,
  opts,
  playCost,
  prepend,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  check,
  damage,
  discardCharacter,
  engage,
  enterAlly,
  raiseThreat,
  returnAlly,
  spendEvent,
} from "./board";
import {
  activeSeat,
  allCharacters,
  globalCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  effectiveTraits,
  hasTrait,
  hasResourceIcon,
} from "./expansion-passives";
import { canPlayAtNoCost } from "./actions";
import { isSacked } from "./carrock";
import { playerAttackKilled } from "./combat";
import { amonPlayerCanEngage } from "./amon-din-player-cards";
import { shadowFlameCanMove } from "./shadow-flame";

const rohanCode = {
  eomer: "07001",
  hirgon: "17055",
  lothiriel: "22027",
  wait: "17005",
  arrow: "17058",
  oath: "17085",
  knight: "17112",
  horn: "22035",
  muster: "22062",
  lancer: "22142",
  guthlaf: "06110",
  breeder: "07007",
  outrider: "07006",
  firefoot: "08004",
  forth: "06138",
} as const;
const affected = (u: Unit) => !playerCardImmune(u);
const uniqueAllowed = (s: GameState, code: string) =>
  !card(code).is_unique ||
  !globalCharacters(s).some((u) => card(u.code).name === card(code).name);
const live = (s: GameState, u: Unit) =>
  allCharacters(s).some((x) => x.id === u.id);
const ownsUniqueTraits = (s: GameState) => {
  const own = [...s.heroes, ...s.allies].filter((u) => card(u.code).is_unique);
  return own.some(
    (r) =>
      hasTrait(r, "Rohan") &&
      own.some((g) => g.id !== r.id && hasTrait(g, "Gondor")),
  );
};
const handEvent = (s: GameState, code: string) =>
  s.hand.some((u) => u.code === code) && canPay(s, card(code));
const optional = (
  s: GameState,
  title: string,
  code: string,
  effect: Effect,
  label: string,
) =>
  choosePlayerResponse(s, effect.source ?? effect.target ?? code, code, title, [
    { id: "use", code, label, effects: [effect] },
    skip,
  ]);
const erase = (s: GameState, player: number, key: string) => {
  const used = seatView(s, player).used;
  for (let i = used.length - 1; i >= 0; i--)
    if (used[i] === key) used.splice(i, 1);
};
const hirgonCostKey = (code: string) => `phase:hirgon-cost:${code}`;
function withHirgonDiscount<T>(s: GameState, code: string, fn: () => T): T {
  const player = activeSeat(s),
    key = hirgonCostKey(code);
  s.used.push(key);
  try {
    return fn();
  } finally {
    erase(s, player, key);
  }
}
const hirgonAllies = (s: GameState) =>
  s.hand.filter(
    (u) =>
      card(u.code).type_code === "ally" &&
      card(u.code).sphere_code === "tactics" &&
      !canPlayAtNoCost(s, u) &&
      withHirgonDiscount(s, u.code, () => canPay(s, card(u.code))),
  );
const lothirielAllies = (s: GameState, h: Unit) =>
  s.hand.filter(
    (u) =>
      card(u.code).type_code === "ally" &&
      uniqueAllowed(s, u.code) &&
      (card(u.code).traits ?? "")
        .split(".")
        .some((t) => effectiveTraits(h).includes(t.trim())),
  );
const stagingEnemies = (s: GameState) =>
  s.staging.filter(
    (u) =>
      card(u.code).type_code === "enemy" &&
      !card(u.code).is_unique &&
      affected(u),
  );
const attackSpillTargets = (s: GameState, player: number) =>
  seatView(s, player).engaged.filter(
    (u) => !card(u.code).is_unique && affected(u),
  );
const outsiderEnemies = (s: GameState) =>
  [
    ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
    ...allEngaged(s).filter((u) => ownerOf(s, u) !== activeSeat(s)),
  ].filter(
    (u) =>
      affected(u) &&
      amonPlayerCanEngage(s, u, activeSeat(s)) &&
      shadowFlameCanMove(s, u),
  );

export function rohanDynamicTraits(s: GameState, u: Unit): string[] {
  return u.code === rohanCode.lothiriel &&
    !u.blanked &&
    allCharacters(s).some((x) => card(x.code).name === "Éomer")
    ? ["Rohan"]
    : [];
}
export function rohanDynamicKeywords(s: GameState, u: Unit): string[] {
  return u.code === rohanCode.guthlaf &&
    !u.blanked &&
    allHeroes(s).some((h) => hasTrait(h, "Gondor"))
    ? ["Sentinel"]
    : [];
}
export function rohanStats(s: GameState, u: Unit) {
  const used = seatView(s, ownerOf(s, u)).used;
  return {
    will: u.attachments.filter((a) => !a.blanked && a.code === rohanCode.arrow)
      .length,
    attack:
      2 *
        used.filter(
          (k) =>
            k === `round:eomer:${u.id}` || k === `attack:riddermark:${u.id}`,
        ).length +
      used.filter((k) => k === `round:hirgon:${u.id}`).length +
      u.attachments.filter((a) => !a.blanked && a.code === rohanCode.firefoot)
        .length *
        (card(u.code).name === "Éomer" ? 2 : 1),
    defense: used.filter((k) => k === `round:hirgon:${u.id}`).length,
  };
}
export function rohanPlayCost(s: GameState, c: Card, cost: number) {
  if (
    c.code === rohanCode.guthlaf &&
    allHeroes(s).some((h) => hasTrait(h, "Rohan"))
  )
    cost = Math.max(0, cost - 1);
  return s.used.includes(hirgonCostKey(c.code))
    ? Math.min(cost, Math.max(1, cost - 1))
    : cost;
}
export function rohanPlayTargets(s: GameState, c: Card): Unit[] | null {
  if (c.code === rohanCode.arrow)
    return allHeroes(s).filter((u) => hasTrait(u, "Gondor") && affected(u));
  if (c.code === rohanCode.horn)
    return allHeroes(s).filter(
      (u) =>
        (hasTrait(u, "Rohan") || card(u.code).name === "Merry") && affected(u),
    );
  if (c.code === rohanCode.firefoot)
    return allHeroes(s).filter(
      (u) =>
        (hasTrait(u, "Rohan") || hasResourceIcon(u, "tactics")) && affected(u),
    );
  return null;
}
export function rohanPlayProblem(s: GameState, c: Card): string | null {
  if (
    [rohanCode.wait, rohanCode.oath].includes(c.code as typeof rohanCode.wait)
  )
    return "This event is offered automatically at the beginning of its phase.";
  if (c.code === rohanCode.muster && s.phase !== "planning")
    return "The Muster of Rohan is a Planning Action.";
  if (c.code === rohanCode.forth && !["defense", "attack"].includes(s.phase))
    return "Forth Eorlingas! is a Combat Action.";
  const targets = rohanPlayTargets(s, c);
  if (targets && !targets.length)
    return "This attachment has no eligible hero.";
  return null;
}
export const rohanAbilityLabel = (code: string) =>
  code === rohanCode.outrider
    ? "Discard · engage an enemy elsewhere"
    : undefined;
export function rohanAbilityProblem(s: GameState, u: Unit) {
  if (u.code !== rohanCode.outrider) return undefined;
  if (u.blanked) return "Westfold Outrider's printed text is blank.";
  if (!outsiderEnemies(s).length)
    return "An enemy must be outside your engagement.";
  return undefined;
}
export function useRohanAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || u.code !== rohanCode.outrider) return false;
  requireRule(!rohanAbilityProblem(s, u), rohanAbilityProblem(s, u) ?? "");
  choose(
    s,
    "Westfold Outrider · Choose an enemy",
    opts(outsiderEnemies(s), (enemy) => [
      fx("rohanOutrider", { source: u.id, target: enemy.id }),
    ]),
  );
  return true;
}
export function rohanEventEffect(s: GameState, code: string): boolean {
  if (code === rohanCode.forth) {
    // FAQ 1.55: player-card lasting effects select affected cards once.
    // Record each physical hero on its controller's seat so later traits or
    // hero entries cannot change this permission, including across seats.
    for (const hero of allHeroes(s).filter(
      (u) => hasTrait(u, "Rohan") && (u.blanked || affected(u)),
    ))
      seatView(s, ownerOf(s, hero)).used.push(
        `phase:forth-eorlingas:${hero.id}`,
      );
    log(
      s,
      "Each Rohan hero can attack enemies in staging this combat phase.",
      "good",
    );
    return true;
  }
  if (code === rohanCode.muster) {
    prepend(
      s,
      fx("rohanMusterSearch", {
        text: JSON.stringify(s.deck.slice(0, 10)),
        ids: [],
      }),
    );
    return true;
  }
  return false;
}
export const rohanStagingAttack = (s: GameState, u: Unit) =>
  card(u.code).type_code === "hero" &&
  globalPlayerOrder(s).some((i) =>
    seatView(s, i).used.includes(`phase:forth-eorlingas:${u.id}`),
  );
export const rohanRevealReduction = (s: GameState, count: number) =>
  Math.max(
    0,
    count -
      playerOrder(s).reduce(
        (n, i) =>
          n +
          seatView(s, i).used.filter((k) => k === "phase:wait-no-longer")
            .length,
        0,
      ),
  );
export const rohanOathPlayers = (s: GameState) =>
  playerOrder(s).filter((i) =>
    seatView(s, i).used.includes("phase:oath-of-eorl"),
  );
export function rohanQuestBegins(s: GameState) {
  prepend(
    s,
    ...playerOrder(s)
      .filter((i) => handEvent(seatView(s, i), rohanCode.wait))
      .map((player) => fx("rohanWaitWindow", { player })),
  );
}
export function rohanCombatBegins(s: GameState) {
  prepend(
    s,
    ...playerOrder(s)
      .filter(
        (i) =>
          handEvent(seatView(s, i), rohanCode.oath) &&
          ownsUniqueTraits(seatView(s, i)),
      )
      .map((player) => fx("rohanOathWindow", { player })),
  );
}
export function rohanCharactersCommitted(s: GameState, units: Unit[]) {
  for (const h of units.filter(
    (u) => u.code === rohanCode.lothiriel && !u.blanked && !isSacked(u),
  ))
    prepend(
      s,
      fx("rohanLothirielResponse", { source: h.id, player: ownerOf(s, h) }),
    );
}
export function rohanAllyEntered(s: GameState, u: Unit) {
  if (u.code === rohanCode.breeder && !u.blanked)
    prepend(
      s,
      fx("rohanBreederResponse", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function rohanCharactersLeft(
  s: GameState,
  units: Unit[],
  _player: number,
  lastKnownTraits?: string[],
) {
  if (!units.length) return;
  const leavingTraits = lastKnownTraits ?? [
    ...new Set(units.flatMap(effectiveTraits)),
  ];
  for (const hero of allHeroes(s).filter(
    (u) => u.code === rohanCode.eomer && !u.blanked && !isSacked(u),
  ))
    if (
      !seatView(s, ownerOf(s, hero)).used.includes(
        `round:eomer-used:${hero.id}`,
      )
    )
      prepend(
        s,
        fx("rohanEomerResponse", { target: hero.id, player: ownerOf(s, hero) }),
      );
  for (const hero of allHeroes(s))
    for (const a of hero.attachments.filter(
      (a) =>
        a.code === rohanCode.horn && !a.blanked && !a.facedown && !a.exhausted,
    ))
      if (effectiveTraits(hero).some((t) => leavingTraits.includes(t)))
        prepend(
          s,
          fx("rohanHornResponse", {
            target: hero.id,
            source: a.id,
            player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
          }),
        );
}
export function rohanQuestSucceeded(s: GameState) {
  for (const u of allCharacters(s).filter((u) => u.committed)) {
    if (u.code === rohanCode.hirgon && !u.blanked && !isSacked(u))
      prepend(
        s,
        fx("rohanHirgonResponse", { source: u.id, player: ownerOf(s, u) }),
      );
    if (u.code === rohanCode.lancer && !u.blanked && stagingEnemies(s).length)
      prepend(
        s,
        fx("rohanLancerResponse", { source: u.id, player: ownerOf(s, u) }),
      );
    for (const a of u.attachments.filter(
      (a) => a.code === rohanCode.arrow && !a.blanked && !a.facedown,
    ))
      if (
        seatView(s, attachmentController(s, u, a) ?? ownerOf(s, u)).threat >= 40
      )
        prepend(
          s,
          fx("rohanArrowResponse", {
            target: u.id,
            source: a.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          }),
        );
  }
}
export function rohanAttackDeclared(
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
) {
  prepend(
    s,
    ...attackers
      .filter((u) => u.code === rohanCode.knight && !u.blanked)
      .map((u) =>
        fx("rohanKnightResponse", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function rohanAttackResolved(
  s: GameState,
  _enemy: Unit,
  ids: string[],
  amount: number,
  remainingHealth: number,
) {
  const excess = Math.max(0, amount - remainingHealth),
    attackers = ids.map((id) => get(s, id)).filter((u): u is Unit => !!u);
  if (attackers.length === 1 && excess > 0) {
    const hero = attackers[0];
    for (const a of hero.attachments.filter(
      (a) =>
        a.code === rohanCode.firefoot &&
        !a.blanked &&
        !a.facedown &&
        !a.exhausted,
    ))
      if (attackSpillTargets(s, ownerOf(s, hero)).length)
        prepend(
          s,
          fx("rohanFirefootResponse", {
            source: a.id,
            target: hero.id,
            value: excess,
            player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
          }),
        );
  }
  prepend(
    s,
    ...attackers
      .filter((u) =>
        seatView(s, ownerOf(s, u)).used.includes(`attack:riddermark:${u.id}`),
      )
      .map((u) =>
        fx("rohanKnightDiscard", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function rohanPhaseEnd(s: GameState) {
  if (!["quest", "staging"].includes(s.phase)) return;
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) =>
        seatView(s, ownerOf(s, u)).used.includes(`quest:lothiriel:${u.id}`),
      )
      .map((u) =>
        fx("rohanLothirielReturn", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function rohanRoundEnd(s: GameState) {
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) =>
        seatView(s, ownerOf(s, u)).used.includes(`round:muster:${u.id}`),
      )
      .map((u) =>
        fx("rohanMusterDiscard", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}

export function handleRohanPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("rohan")) return false;
  const u = get(s, e.target ?? e.source);
  switch (e.kind) {
    case "rohanOutrider": {
      const source = get(s, e.source),
        enemy = get(s, e.target);
      requireRule(
        source?.code === rohanCode.outrider &&
          enemy &&
          outsiderEnemies(s).some((x) => x.id === enemy.id),
        "Choose an enemy outside your engagement.",
      );
      discardCharacter(s, source);
      if (s.status === "playing") engage(s, enemy);
      break;
    }
    case "rohanEomerResponse":
      if (
        u &&
        live(s, u) &&
        !u.blanked &&
        !isSacked(u) &&
        !s.used.includes(`round:eomer-used:${u.id}`)
      )
        optional(
          s,
          "Éomer · A character left play",
          u.code,
          fx("rohanEomerBoost", { target: u.id }),
          "Gain +2 attack this round",
        );
      break;
    case "rohanEomerBoost":
      if (u) {
        s.used.push(`round:eomer-used:${u.id}`, `round:eomer:${u.id}`);
        log(s, "Éomer gains +2 attack this round.", "good");
      }
      break;
    case "rohanHornResponse": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && !a.blanked && !a.facedown && !a.exhausted,
      );
      if (a)
        optional(
          s,
          "Horn of the Mark · A matching character left play",
          a.code,
          fx("rohanHornDraw", { target: u!.id, source: a.id }),
          "Exhaust Horn of the Mark · draw 1 card",
        );
      break;
    }
    case "rohanHornDraw": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && !a.blanked && !a.facedown && !a.exhausted,
      );
      if (a) {
        a.exhausted = true;
        draw(s, 1);
      }
      break;
    }
    case "rohanBreederResponse":
      if (u && live(s, u) && !u.blanked)
        optional(
          s,
          "Westfold Horse-breeder · Search for a Mount",
          u.code,
          fx("rohanBreederSearch", { source: u.id }),
          "Search your top 10 cards for a Mount",
        );
      break;
    case "rohanBreederSearch": {
      const top = s.deck.slice(0, 10),
        options = top.flatMap((code, index) =>
          card(code).type_code === "attachment" &&
          (card(code).traits ?? "").split(".").some((t) => t.trim() === "Mount")
            ? [
                {
                  id: `take-${index}`,
                  code,
                  label: card(code).name,
                  effects: [fx("rohanBreederTake", { value: index, code })],
                },
              ]
            : [],
        );
      log(s, `Horse-breeder searches the top ${top.length} cards.`);
      if (options.length)
        choose(s, "Westfold Horse-breeder · Choose a Mount", [
          ...options,
          { ...skip, effects: [fx("rohanShuffle")] },
        ]);
      else shuffle(s, s.deck);
      break;
    }
    case "rohanBreederTake":
      if (s.deck[e.value!] === e.code) {
        s.hand.push(takePlayerDeck(s, e.value!));
        shuffle(s, s.deck);
      }
      break;
    case "rohanShuffle":
      shuffle(s, s.deck);
      break;
    case "rohanWaitWindow":
      if (handEvent(s, rohanCode.wait))
        optional(
          s,
          "Wait no Longer · Quest phase begins",
          rohanCode.wait,
          fx("rohanWaitPlay", {
            source: s.hand.find((u) => u.code === rohanCode.wait)!.id,
          }),
          `Play Wait no Longer · ${playCost(s, card(rohanCode.wait))} Tactics`,
        );
      break;
    case "rohanWaitPlay": {
      if (!spendEvent(s, rohanCode.wait)) break;
      const top = s.encounterDeck.slice(0, 5),
        options = top.flatMap((code, index) =>
          card(code).type_code === "enemy"
            ? [
                {
                  id: `enemy-${index}`,
                  code,
                  label: card(code).name,
                  effects: [fx("rohanWaitEnemy", { value: index, code })],
                },
              ]
            : [],
        );
      if (options.length)
        choose(
          s,
          "Wait no Longer · Choose a searched enemy",
          options,
          "Put it into play engaged with you, then reveal one fewer encounter card this quest phase.",
        );
      else {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "No enemy was found; the reveal reduction does not follow the incomplete search.",
        );
        prepend(s, fx("rohanWaitWindow"));
      }
      break;
    }
    case "rohanWaitEnemy": {
      requireRule(
        s.encounterDeck[e.value!] === e.code,
        "Choose an enemy among the searched cards.",
      );
      const enemy = make(s, s.encounterDeck.splice(e.value!, 1)[0]);
      s.staging.push(enemy);
      engage(s, enemy);
      s.used.push("phase:wait-no-longer");
      shuffle(s, s.encounterDeck);
      prepend(s, fx("rohanWaitWindow"));
      break;
    }
    case "rohanOathWindow":
      if (
        handEvent(s, rohanCode.oath) &&
        ownsUniqueTraits(s) &&
        !s.used.includes("phase:oath-of-eorl")
      )
        optional(
          s,
          "Oath of Eorl · Combat phase begins",
          rohanCode.oath,
          fx("rohanOathPlay", {
            source: s.hand.find((u) => u.code === rohanCode.oath)!.id,
          }),
          `Play Oath of Eorl · ${playCost(s, card(rohanCode.oath))} Tactics`,
        );
      break;
    case "rohanOathPlay":
      requireRule(
        ownsUniqueTraits(s),
        "Control separate unique Rohan and Gondor characters.",
      );
      if (!spendEvent(s, rohanCode.oath)) break;
      s.used.push("phase:oath-of-eorl");
      log(
        s,
        "This player resolves player attacks before enemy attacks this combat phase.",
        "good",
      );
      break;
    case "rohanLothirielResponse":
      if (
        u &&
        live(s, u) &&
        !u.blanked &&
        !isSacked(u) &&
        lothirielAllies(s, u).length
      )
        optional(
          s,
          "Lothíriel · Commit an ally from hand",
          u.code,
          fx("rohanLothirielChoose", { source: u.id }),
          "Put an ally sharing a trait into play exhausted and questing",
        );
      break;
    case "rohanLothirielChoose":
      if (u)
        choose(
          s,
          "Lothíriel · Choose an ally",
          opts(lothirielAllies(s, u), (ally) => [
            fx("rohanLothirielEnter", { source: u.id, target: ally.id }),
          ]),
        );
      break;
    case "rohanLothirielEnter": {
      const h = get(s, e.source),
        ally = s.hand.find((x) => x.id === e.target);
      requireRule(
        h && ally && lothirielAllies(s, h).some((x) => x.id === ally.id),
        "Choose an ally sharing a trait with Lothíriel.",
      );
      s.hand = s.hand.filter((x) => x.id !== ally.id);
      ally.exhausted = true;
      ally.committed = true;
      s.used.push(`quest:lothiriel:${ally.id}`);
      enterAlly(s, ally);
      break;
    }
    case "rohanLothirielReturn":
      if (u && live(s, u)) {
        erase(s, ownerOf(s, u), `quest:lothiriel:${u.id}`);
        returnAlly(s, u, true);
      }
      break;
    case "rohanHirgonResponse":
      if (
        u &&
        live(s, u) &&
        !u.blanked &&
        !isSacked(u) &&
        hirgonAllies(s).length
      )
        optional(
          s,
          "Hirgon · Quest succeeded",
          u.code,
          fx("rohanHirgonChoose", { source: u.id }),
          "Play a Tactics ally at a cost reduced by 1 (minimum 1)",
        );
      break;
    case "rohanHirgonChoose":
      choose(
        s,
        "Hirgon · Choose an ally",
        opts(hirgonAllies(s), (ally) => [
          fx("rohanHirgonPay", {
            target: ally.id,
            count: withHirgonDiscount(s, ally.code, () =>
              playCost(s, card(ally.code)),
            ),
            ids: [],
          }),
        ]),
      );
      break;
    case "rohanHirgonPay": {
      const ally = s.hand.find((x) => x.id === e.target);
      requireRule(
        ally && !canPlayAtNoCost(s, ally),
        "The chosen ally can no longer be played.",
      );
      if ((e.count ?? 0) > 0)
        choose(
          s,
          "Hirgon · Choose a resource pool",
          opts(
            eligiblePayers(s, card(ally.code)).filter((h) => h.resources > 0),
            (h) => [
              fx("rohanHirgonResource", {
                source: h.id,
                target: ally.id,
                count: e.count,
                ids: e.ids,
              }),
            ],
            (h) => `${name(h)} · pay 1 (${h.resources} available)`,
          ),
          `${e.count} matching resource${e.count === 1 ? "" : "s"} remaining.`,
        );
      else {
        s.hand = s.hand.filter((x) => x.id !== ally.id);
        s.alliesPlayed++;
        prepend(s, fx("rohanHirgonBuff", { target: ally.id }));
        enterAlly(s, ally, false, true);
      }
      break;
    }
    case "rohanHirgonResource": {
      const payer = get(s, e.source),
        ally = s.hand.find((x) => x.id === e.target);
      requireRule(
        payer &&
          ally &&
          payer.resources > 0 &&
          eligiblePayers(s, card(ally.code)).some((x) => x.id === payer.id),
        "Choose an available matching resource pool.",
      );
      spendResources(s, payer, 1);
      prepend(
        s,
        fx("rohanHirgonPay", {
          target: ally.id,
          count: e.count! - 1,
          ids: [...(e.ids ?? []), payer.id],
        }),
      );
      break;
    }
    case "rohanHirgonBuff":
      if (u && live(s, u))
        choose(s, "Hirgon · Strengthen the played ally", [
          {
            id: "raise",
            label:
              "Raise threat by 1 · ally gets +1 attack and defense this round",
            code: u.code,
            effects: [fx("rohanHirgonBoost", { target: u.id })],
          },
          skip,
        ]);
      break;
    case "rohanHirgonBoost":
      raiseThreat(s, 1, "cost");
      check(s);
      if (s.status === "playing" && u) s.used.push(`round:hirgon:${u.id}`);
      break;
    case "rohanLancerResponse":
      if (u && live(s, u) && !u.blanked && stagingEnemies(s).length)
        optional(
          s,
          "Westfold Lancer · Quest succeeded",
          u.code,
          fx("rohanLancerChoose", { source: u.id }),
          "Discard Westfold Lancer to damage a non-unique staging enemy",
        );
      break;
    case "rohanLancerChoose":
      if (u)
        choose(
          s,
          "Westfold Lancer · Choose a staging enemy",
          opts(stagingEnemies(s), (enemy) => [
            fx("rohanLancerDamage", { source: u.id, target: enemy.id }),
          ]),
        );
      break;
    case "rohanLancerDamage": {
      const ally = get(s, e.source),
        enemy = get(s, e.target);
      requireRule(
        ally && enemy && stagingEnemies(s).some((x) => x.id === enemy.id),
        "Choose a non-unique enemy in staging.",
      );
      discardCharacter(s, ally);
      if (s.status === "playing") damage(s, enemy.id, 2);
      break;
    }
    case "rohanArrowResponse": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && !a.blanked && !a.facedown,
      );
      if (a && s.threat >= 40)
        optional(
          s,
          "The Red Arrow · Valour quest success",
          a.code,
          fx("rohanArrowSearch", { target: u!.id, source: a.id }),
          "Add The Red Arrow to victory · search top 5 for an ally",
        );
      break;
    }
    case "rohanArrowSearch": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && !a.blanked && !a.facedown,
      );
      if (!a) break;
      u!.attachments = u!.attachments.filter((x) => x.id !== a.id);
      (s.victoryCards ??= []).push(a.code);
      const top = s.deck.slice(0, 5),
        options = top.flatMap((code, index) =>
          card(code).type_code === "ally" && uniqueAllowed(s, code)
            ? [
                {
                  id: `ally-${index}`,
                  code,
                  label: card(code).name,
                  effects: [fx("rohanArrowAlly", { value: index, code })],
                },
              ]
            : [],
        );
      if (options.length)
        choose(s, "The Red Arrow · Choose a searched ally", [
          ...options,
          { ...skip, effects: [fx("rohanShuffle")] },
        ]);
      else shuffle(s, s.deck);
      break;
    }
    case "rohanArrowAlly":
      if (s.deck[e.value!] === e.code && uniqueAllowed(s, e.code!)) {
        const ally = takePlayerDeck(s, e.value!);
        shuffle(s, s.deck);
        enterAlly(s, ally);
      }
      break;
    case "rohanKnightResponse":
      if (u && live(s, u) && !u.blanked)
        optional(
          s,
          "Riddermark Knight · Declared as an attacker",
          u.code,
          fx("rohanKnightBoost", { target: u.id }),
          "Gain +2 attack for this attack · discard at its end",
        );
      break;
    case "rohanKnightBoost":
      if (u) s.used.push(`attack:riddermark:${u.id}`);
      break;
    case "rohanKnightDiscard":
      if (u && live(s, u)) {
        erase(s, ownerOf(s, u), `attack:riddermark:${u.id}`);
        discardCharacter(s, u);
      }
      break;
    case "rohanFirefootResponse": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && !a.blanked && !a.facedown && !a.exhausted,
      );
      if (a && attackSpillTargets(s, ownerOf(s, u!)).length)
        optional(
          s,
          "Firefoot · Assign excess attack damage",
          a.code,
          fx("rohanFirefootChoose", {
            source: a.id,
            target: u!.id,
            value: e.value,
          }),
          `Exhaust Firefoot · assign ${e.value} excess damage`,
        );
      break;
    }
    case "rohanFirefootChoose":
      if (u)
        choose(
          s,
          "Firefoot · Choose a non-unique engaged enemy",
          opts(attackSpillTargets(s, ownerOf(s, u)), (enemy) => [
            fx("rohanFirefootDamage", {
              source: e.source,
              target: enemy.id,
              value: e.value,
              text: u.id,
            }),
          ]),
        );
      break;
    case "rohanFirefootDamage": {
      const hero = get(s, e.text),
        a = hero?.attachments.find(
          (a) => a.id === e.source && !a.blanked && !a.facedown && !a.exhausted,
        ),
        enemy = get(s, e.target);
      requireRule(
        hero &&
          a &&
          enemy &&
          attackSpillTargets(s, ownerOf(s, hero)).some(
            (x) => x.id === enemy.id,
          ),
        "Choose a non-unique enemy engaged with the attached hero's controller.",
      );
      a.exhausted = true;
      const remainingHealth = stats(s, enemy).health - enemy.damage,
        engagedPlayer = ownerOf(s, enemy),
        lastKnownTraits = effectiveTraits(enemy);
      const assigned = damage(s, enemy.id, e.value ?? 0, {
        combatDamage: true,
      });
      if (
        assigned &&
        (e.value ?? 0) >= remainingHealth &&
        !get(s, enemy.id) &&
        s.status === "playing"
      )
        playerAttackKilled(s, enemy, [hero.id], engagedPlayer, lastKnownTraits);
      break;
    }
    case "rohanMusterSearch": {
      const top = JSON.parse(e.text ?? "[]") as string[],
        selected = e.ids ?? [],
        options = top.flatMap((code, index) =>
          !selected.includes(String(index)) &&
          card(code).type_code === "ally" &&
          (card(code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Rohan") &&
          uniqueAllowed(s, code) &&
          (!card(code).is_unique ||
            !selected.some(
              (i) => card(top[Number(i)]).name === card(code).name,
            ))
            ? [
                {
                  id: `ally-${index}`,
                  code,
                  label: card(code).name,
                  effects: [
                    fx("rohanMusterSearch", {
                      text: e.text,
                      ids: [...selected, String(index)],
                    }),
                  ],
                },
              ]
            : [],
        );
      if (selected.length < 4 && options.length)
        choose(
          s,
          "The Muster of Rohan · Select up to four allies",
          [
            ...options,
            {
              id: "done",
              label: `Put ${selected.length} selected allies into play`,
              effects: [
                fx("rohanMusterResolve", { text: e.text, ids: selected }),
              ],
            },
          ],
          `${selected.length}/4 selected; only the original top 10 cards are searched.`,
        );
      else
        prepend(s, fx("rohanMusterResolve", { text: e.text, ids: selected }));
      break;
    }
    case "rohanMusterResolve": {
      const top = JSON.parse(e.text ?? "[]") as string[],
        indices = (e.ids ?? []).map(Number);
      requireRule(
        indices.every((i) => s.deck[i] === top[i]),
        "Searched cards must still be in the deck.",
      );
      const codes = indices.map((i) => top[i]);
      for (const i of [...indices].sort((a, b) => b - a)) takePlayerDeck(s, i);
      shuffle(s, s.deck);
      prepend(s, ...codes.map((code) => fx("rohanMusterEnter", { code })));
      break;
    }
    case "rohanMusterEnter":
      if (uniqueAllowed(s, e.code!)) {
        const ally = make(s, e.code!);
        s.used.push(`round:muster:${ally.id}`);
        enterAlly(s, ally);
      } else {
        s.deck.push(e.code!);
        shuffle(s, s.deck);
      }
      break;
    case "rohanMusterDiscard":
      if (u && live(s, u)) discardCharacter(s, u);
      break;
    default:
      return false;
  }
  return true;
}
