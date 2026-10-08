import { choosePlayerResponse } from "./player-ability-triggers";
import {
  dikeCannotLeaveDiscard,
  DIKE_DISCARD_REASON,
} from "./deadmens-discard";
import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { movableHand } from "./hand-rules";
import { takePlayerDeck } from "./core";
import { takePlayerDiscard } from "./board";
// Exact Elves of Lórien main-list rules. The original printings remain in the catalog.
// Primary guide: https://images-cdn.fantasyflightgames.com/filer_public/72/d2/72d27c2e-e5d0-4d43-9e66-aa332dbf7423/mec104_rules.pdf
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  draw,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  enterAlly,
  allyCanEnter,
  exhaustCharacter,
  readyCharacter,
  returnAlliesToHand,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  livingSeats,
  ownerOf,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { rhosgobelHeal } from "./rhosgobel";
import { playerAttack } from "./combat";
import { canPlayAtNoCost } from "./actions";
import { khazadCannotExhaust } from "./khazad-dum";

export const ELF_ATTACHMENT_ACTIONS = ["08064", "08121", "08058"];
const printedTrait = (c: Card, trait: string) =>
  (c.traits ?? "")
    .split(".")
    .some((t) => t.trim().toLowerCase() === trait.toLowerCase());
const silvanAllies = (s: GameState, player = activeSeat(s)) =>
  seatView(s, player).allies.filter(
    (u) =>
      ["ally", "objective-ally"].includes(card(u.code).type_code) &&
      hasTrait(u, "Silvan"),
  );
const influenceTargets = (s: GameState) =>
  allCharacters(s).filter((u) => !playerCardImmune(u));
const uniqueNoldor = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => card(u.code).is_unique && hasTrait(u, "Noldor"),
  );
const councilTargets = (s: GameState) =>
  influenceTargets(s).filter((u) => uniqueNoldor(s).some((n) => n.id !== u.id));
const enemyTargets = (s: GameState) =>
  allEngaged(s).filter((u) => !playerCardImmune(u));
const haldirTargets = (s: GameState, u: Unit) => [
  ...s.staging.filter((x) => card(x.code).type_code === "enemy"),
  ...allEngaged(s).filter((x) => ownerOf(s, x) !== ownerOf(s, u)),
];
const liveAttachment = (s: GameState, e: Effect, code?: string) => {
  const host = get(s, e.target);
  const attachment = host?.attachments.find(
    (a) =>
      a.id === e.source &&
      !a.blanked &&
      !a.facedown &&
      (!code || a.code === code),
  );
  return { host, attachment };
};
function lowerThreat(
  s: GameState,
  amount: number,
  source?: Parameters<typeof reduceThreat>[2],
) {
  const reduction = reduceThreat(s, amount, source);
  log(
    s,
    `${seatName(s, activeSeat(s))} reduces threat by ${reduction}.`,
    "good",
  );
}
const playerOptions = (s: GameState, effect: (player: number) => Effect[]) =>
  livingSeats(s).map((player) => ({
    id: `player-${player}`,
    label: seatName(s, player),
    effects: effect(player),
  }));
function optional(
  s: GameState,
  title: string,
  code: string,
  effect: Effect,
  label: string,
  delayed = false,
) {
  const options = [{ id: "use", code, label, effects: [effect] }, skip];
  if (delayed) choose(s, title, options);
  else
    choosePlayerResponse(
      s,
      effect.source ?? effect.target ?? code,
      code,
      title,
      options,
    );
}

export function elfStats(s: GameState, u: Unit) {
  const used = seatView(s, ownerOf(s, u)).used;
  const celeborn = used.filter((k) => k === `round:celeborn:${u.id}`).length;
  const nenya = used
    .filter((k) => k.startsWith(`phase:nenya:${u.id}:`))
    .reduce((n, k) => n + (Number(k.split(":").at(-1)) || 0), 0);
  return { will: celeborn + nenya, attack: celeborn, defense: celeborn };
}
export function elfNoQuestExhaust(s: GameState, u: Unit) {
  const p = seatView(s, ownerOf(s, u));
  return (
    p.used.includes(`round:naith-guide:${u.id}`) ||
    (["ally", "objective-ally"].includes(card(u.code).type_code) &&
      p.heroes.some((h) => h.code === "08112" && !h.blanked) &&
      p.used.includes(`round:elf-entered:${u.id}`))
  );
}
export function elfPlayCost(s: GameState, c: Card, cost: number) {
  if (c.type_code !== "ally" || !printedTrait(c, "Silvan")) return cost;
  const discount = seatIndices(s).reduce(
    (n, i) =>
      n + seatView(s, i).used.filter((k) => k === "phase:o-lorien").length,
    0,
  );
  return Math.min(cost, Math.max(1, cost - discount));
}
export function elfPlayProblem(s: GameState, c: Card) {
  if (
    c.code === "08064" &&
    !s.heroes.some((h) => hasTrait(h, "Noldor") || hasTrait(h, "Silvan"))
  )
    return "Lembas requires a Noldor or Silvan hero you control.";
  if (c.code === "22036") {
    if (s.phase !== "planning")
      return "Host of Galadhrim is a Planning Action.";
    if (!silvanAllies(s).length)
      return "A Silvan ally you control must be in play.";
  }
  if (c.code === "08027") {
    if (!["defense", "attack"].includes(s.phase))
      return "Feigned Voices is a Combat Action.";
    if (!enemyTargets(s).length)
      return "An eligible enemy must be engaged with a player.";
  }
  if (["08009", "08027"].includes(c.code) && !silvanAllies(s).length)
    return "Return a Silvan ally you control as the event's cost.";
  if (c.code === "08009" && s.used.includes("phase:tree-people"))
    return "Only one copy of The Tree People may be played each phase.";
  if (c.code === "04059" && !councilTargets(s).length)
    return "Elrond's Counsel requires a unique Noldor character you control and another character.";
  return undefined;
}
export function elfPlayTargets(s: GameState, c: Card): Unit[] | null {
  if (c.code === "08121") return allHeroes(s).filter((h) => h.code === "08112");
  if (c.code === "08092")
    return allHeroes(s).filter((h) => hasTrait(h, "Ranger"));
  if (["08064", "08058"].includes(c.code)) return allHeroes(s);
  if (c.code === "04059") return councilTargets(s);
  return null;
}
export const elfAbilityLabel = (code: string) =>
  ({
    "08112": "Reduce threat & draw a card",
    "08056": "Attack beyond your engagement",
  })[code];
export function elfAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (attachmentId && (!a || !ELF_ATTACHMENT_ACTIONS.includes(a.code)))
    return undefined;
  if (
    attachmentId &&
    (!a || a.blanked || a.facedown || (a.exhausted && a.code !== "08064"))
  )
    return "The attachment must be ready and its printed text active.";
  const code = a?.code ?? u.code;
  if (!a && u.blanked) return "This character's printed text is blank.";
  if (code === "08112") {
    if (u.exhausted) return "Galadriel must be ready.";
    if (seatView(s, ownerOf(s, u)).used.includes(`round:galadriel:${u.id}`))
      return "Galadriel has already used her action this round.";
  }
  if (code === "08056") {
    if (!["defense", "attack"].includes(s.phase))
      return "Haldir's action is a Combat Action.";
    if (u.exhausted) return "Haldir must be ready.";
    if (s.used.includes("round:engaged-enemy"))
      return "You engaged an enemy this round.";
    if (s.used.includes(`round:haldir:${u.id}`))
      return "Haldir has already used this action this round.";
    if (!haldirTargets(s, u).length)
      return "An enemy must be outside your engagement.";
  }
  if (code === "08064" && !u.exhausted && !u.damage)
    return "The hero is already ready and has no damage.";
  if (code === "08121") {
    if (!["quest", "staging"].includes(s.phase))
      return "Nenya is a Quest Action.";
    if (u.code !== "08112" || u.exhausted)
      return "Galadriel and Nenya must both be ready.";
    if (khazadCannotExhaust(u))
      return "Galadriel cannot exhaust to pay Nenya's action cost.";
    if (!influenceTargets(s).some((x) => x.id !== u.id))
      return "Another character must be in play.";
  }
  return undefined;
}
export function useElfAbility(s: GameState, u: Unit, attachmentId?: string) {
  const a = u.attachments.find((a) => a.id === attachmentId),
    code = a?.code ?? u.code;
  if (!ELF_ATTACHMENT_ACTIONS.includes(code) && !elfAbilityLabel(code))
    return false;
  requireRule(
    !elfAbilityProblem(s, u, attachmentId),
    elfAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (code === "08112") {
    requireRule(
      !isSacked(u),
      "Galadriel cannot trigger her action while Sacked.",
    );
    exhaustCharacter(s, u);
    seatView(s, ownerOf(s, u)).used.push(`round:galadriel:${u.id}`);
    choose(
      s,
      "Galadriel · Choose a player",
      playerOptions(s, (player) => [
        fx("elfGaladriel", { player, source: u.id, code: u.code }),
      ]),
    );
  } else if (code === "08056")
    choose(
      s,
      "Haldir of Lórien · Choose an enemy",
      opts(haldirTargets(s, u), (enemy) => [
        fx("elfHaldir", { source: u.id, target: enemy.id }),
      ]),
    );
  else if (code === "08064") {
    const physicalOwner = a!.owner ?? ownerOf(s, u);
    discardAttachment(s, u, a!);
    readyCharacter(s, u);
    rhosgobelHeal(s, u, 3, {
      source: a!.id,
      code: "08064",
      player: physicalOwner,
    });
  } else if (code === "08121") {
    a!.exhausted = true;
    exhaustCharacter(s, u);
    choose(
      s,
      "Nenya · Add Galadriel's willpower",
      opts(
        influenceTargets(s).filter((x) => x.id !== u.id),
        (target) => [fx("elfNenya", { source: u.id, target: target.id })],
      ),
    );
  } else if (code === "08058") {
    a!.exhausted = true;
    s.used.push("phase:o-lorien");
    log(
      s,
      "O Lórien! reduces the next Silvan ally played this phase by any player (minimum cost 1).",
      "good",
    );
  }
  return true;
}
export function elfEventEffect(s: GameState, code: string, target?: string) {
  if (code === "04108") {
    const before = s.hand.length;
    draw(s, 2);
    if (s.hand.length === before + 2)
      choose(
        s,
        "Daeron's Runes · Discard one card",
        opts(movableHand(s), (u) => [fx("elfRunesDiscard", { target: u.id })]),
      );
  } else if (code === "04059") {
    const u = councilTargets(s).find((u) => u.id === target);
    requireRule(u, "Choose another character for Elrond's Counsel.");
    u.tempWill = (u.tempWill ?? 0) + 1;
    lowerThreat(s, 3, code);
  } else if (["08009", "08027"].includes(code)) {
    if (code === "08009") s.used.push("phase:tree-people");
    choose(
      s,
      `${card(code).name} · Return a Silvan ally`,
      opts(silvanAllies(s), (u) => [
        fx("elfReturnCost", { target: u.id, code }),
      ]),
    );
  } else if (code === "22036") {
    const moved = returnAlliesToHand(s, silvanAllies(s));
    if (s.status !== "playing") return true;
    const ids = moved
      .filter((m) => m.player === activeSeat(s))
      .map((m) => m.id);
    s.queue.push(fx("elfHostChoose", { ids, player: activeSeat(s) }));
  } else return false;
  return true;
}
export function elfAllyEntered(s: GameState, u: Unit, played: boolean) {
  const player = ownerOf(s, u);
  seatView(s, player).used.push(`round:elf-entered:${u.id}`);
  if (played && hasTrait(u, "Silvan"))
    for (const i of seatIndices(s)) {
      const used = seatView(s, i).used;
      used.splice(
        0,
        used.length,
        ...used.filter((k) => k !== "phase:o-lorien"),
      );
    }
  const effects: Effect[] = [];
  if (hasTrait(u, "Silvan"))
    for (const h of allHeroes(s).filter(
      (h) => h.code === "08001" && !h.blanked && !isSacked(h),
    ))
      effects.push(
        fx("elfCelebornResponse", {
          target: u.id,
          source: h.id,
          player: ownerOf(s, h),
        }),
      );
  if (["16003", "08063", "08117", "08002", "08114"].includes(u.code))
    effects.push(fx("elfAllyResponse", { target: u.id, player }));
  prepend(s, ...effects);
}
export function elfCharactersCommitted(s: GameState, units: Unit[]) {
  for (const u of units)
    for (const a of u.attachments.filter(
      (a) => a.code === "08092" && !a.blanked && !a.facedown && !a.exhausted,
    ))
      prepend(
        s,
        fx("elfWingfootNameResponse", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
}
export function elfEncounterRevealed(s: GameState, code: string) {
  if (!["quest", "staging"].includes(s.phase)) return;
  const type = card(code).type_code;
  for (const host of allHeroes(s))
    for (const a of host.attachments.filter(
      (a) => a.code === "08092" && !a.blanked && !a.facedown && !a.exhausted,
    )) {
      const player = attachmentController(s, host, a);
      if (
        player !== null &&
        seatView(s, player).used.includes(`phase:wingfoot:${a.id}:${type}`)
      )
        prepend(
          s,
          fx("elfWingfootReadyResponse", {
            target: host.id,
            source: a.id,
            code,
            player,
          }),
        );
    }
}
export function elfEnemyCannotAttack(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  return seatView(s, player).used.includes(`phase:feigned:${enemy.id}`);
}
export function elfCharactersLeft(s: GameState, units: Unit[], player: number) {
  if (
    !units.some((u) =>
      ["hero", "ally", "objective-ally"].includes(card(u.code).type_code),
    )
  )
    return;
  const forced = allCharacters(s)
    .filter((u) => u.code === "06037")
    .map((u) =>
      fx("elfRefugeeDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
  const responses = units.some(
    (u) => card(u.code).type_code === "ally" && hasTrait(u, "Silvan"),
  )
    ? seatView(s, player)
        .allies.filter((u) => u.code === "08065" && u.exhausted)
        .map((u) => fx("elfNaithResponse", { target: u.id, player }))
    : [];
  prepend(s, ...forced, ...responses);
}
function searchChoice(s: GameState, kind: "event" | "silvan") {
  const top = s.deck.slice(0, 5);
  const options = top.flatMap((code, index) => {
    const c = card(code);
    const eligible =
      kind === "event"
        ? c.type_code === "event"
        : allyCanEnter(s, code) && printedTrait(card(code), "Silvan");
    return eligible
      ? [
          {
            id: `take-${index}`,
            code,
            label: c.name,
            effects: [fx("elfSearchTake", { count: index, text: kind })],
          },
        ]
      : [];
  });
  choose(
    s,
    kind === "event"
      ? "Galadhrim Minstrel · Search top five"
      : "The Tree People · Search top five",
    [
      ...options,
      {
        id: "none",
        label: "Take no card and shuffle",
        effects: [fx("elfSearchTake", { count: -1, text: kind })],
      },
    ],
  );
}
export function handleElfPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "elfGaladriel":
      lowerThreat(s, 1, { id: e.source, code: e.code });
      draw(s, 1);
      break;
    case "elfHaldir": {
      const h = get(s, e.source),
        enemy = get(s, e.target);
      requireRule(
        h?.code === "08056" &&
          enemy &&
          !elfAbilityProblem(s, h) &&
          haldirTargets(s, h).some((u) => u.id === enemy.id),
        "Choose a legal enemy for Haldir's Combat Action.",
      );
      s.used.push(`round:haldir:${h.id}`);
      playerAttack(s, enemy, [h.id], false, "haldir");
      break;
    }
    case "elfNenya": {
      const galadriel = get(s, e.source),
        target = influenceTargets(s).find((u) => u.id === e.target);
      requireRule(
        galadriel && target && target.id !== galadriel.id,
        "Choose another character for Nenya.",
      );
      seatView(s, ownerOf(s, target)).used.push(
        `phase:nenya:${target.id}:${stats(s, galadriel).will}`,
      );
      break;
    }
    case "elfRunesDiscard": {
      const u = s.hand.find((u) => u.id === e.target);
      requireRule(u, "Choose a card in your hand.");
      discardHandCard(s, u.id);
      break;
    }
    case "elfReturnCost": {
      const u = silvanAllies(s).find((u) => u.id === e.target);
      requireRule(u, "Return a Silvan ally you control.");
      returnAlliesToHand(s, [u]);
      if (s.status !== "playing") break;
      s.queue.push(
        fx(e.code === "08009" ? "elfTreeSearch" : "elfFeignedChoose", {
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "elfTreeSearch":
      searchChoice(s, "silvan");
      break;
    case "elfFeignedChoose":
      choose(
        s,
        "Feigned Voices · Choose an engaged enemy",
        opts(enemyTargets(s), (u) => [
          fx("elfFeigned", { target: u.id, player: ownerOf(s, u) }),
        ]),
      );
      break;
    case "elfFeigned":
      requireRule(get(s, e.target), "The enemy must remain in play.");
      s.used.push(`phase:feigned:${e.target}`);
      break;
    case "elfHostChoose": {
      const ids = e.ids ?? [];
      const candidates = s.hand.filter(
        (u) => ids.includes(u.id) && !canPlayAtNoCost(s, u),
      );
      if (!candidates.length) break;
      choose(
        s,
        "Host of Galadhrim · Play a returned ally",
        opts(candidates, (u) => [fx("elfHostPlay", { target: u.id, ids })]),
      );
      break;
    }
    case "elfHostPlay": {
      const u = s.hand.find((u) => u.id === e.target);
      requireRule(
        u && !canPlayAtNoCost(s, u),
        "Choose a returned ally that can legally be played.",
      );
      s.hand = s.hand.filter((x) => x.id !== u.id);
      s.alliesPlayed++;
      enterAlly(s, u, false, true);
      s.queue.push(
        fx("elfHostChoose", {
          ids: (e.ids ?? []).filter((id) => id !== u.id),
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "elfCelebornResponse": {
      const target = get(s, e.target),
        hero = get(s, e.source);
      if (!target || !hero || hero.blanked || isSacked(hero)) break;
      optional(
        s,
        "Celeborn · Silvan ally entered play",
        "08001",
        { ...e, kind: "elfCeleborn" },
        `Give ${name(target)} +1 willpower, attack and defense this round`,
      );
      break;
    }
    case "elfCeleborn": {
      const u = get(s, e.target);
      if (u) seatView(s, ownerOf(s, u)).used.push(`round:celeborn:${u.id}`);
      break;
    }
    case "elfAllyResponse": {
      const u = get(s, e.target);
      if (!u || u.blanked) break;
      const possible =
        u.code === "16003"
          ? allHeroes(s).some((h) => h.exhausted)
          : u.code === "08063"
            ? s.deck.length > 0
            : u.code === "08117"
              ? livingSeats(s).some((i) => seatView(s, i).threat > 0)
              : u.code === "08002"
                ? allHeroes(s).length > 0
                : !dikeCannotLeaveDiscard(s) &&
                  s.discard.some(
                    (c) =>
                      card(c).type_code === "ally" &&
                      printedTrait(card(c), "Silvan"),
                  );
      if (possible)
        optional(
          s,
          `${name(u)} · Entered play`,
          u.code,
          { ...e, kind: "elfAllyResolve" },
          "Use the enters-play response",
        );
      break;
    }
    case "elfAllyResolve": {
      const u = get(s, e.target);
      if (!u || u.blanked) break;
      if (u.code === "16003")
        choose(
          s,
          "Greenwood Archer · Ready a hero",
          opts(
            allHeroes(s).filter((h) => h.exhausted),
            (h) => [fx("elfReady", { target: h.id })],
          ),
        );
      else if (u.code === "08002")
        choose(
          s,
          "Naith Guide · Quest without exhausting",
          opts(allHeroes(s), (h) => [fx("elfGuide", { target: h.id })]),
        );
      else if (u.code === "08117")
        choose(
          s,
          "Galadriel's Handmaiden · Choose a player",
          playerOptions(s, (player) => [
            fx("elfHandmaiden", { player, source: u.id, code: u.code }),
          ]),
        );
      else if (u.code === "08063") searchChoice(s, "event");
      else if (u.code === "08114" && !dikeCannotLeaveDiscard(s))
        choose(
          s,
          "Orophin · Return a Silvan ally",
          s.discard.flatMap((code, index) =>
            card(code).type_code === "ally" &&
            printedTrait(card(code), "Silvan")
              ? [
                  {
                    id: `recover-${index}`,
                    code,
                    label: card(code).name,
                    effects: [fx("elfOrophin", { count: index, code })],
                  },
                ]
              : [],
          ),
        );
      break;
    }
    case "elfReady": {
      const u = get(s, e.target);
      if (u) readyCharacter(s, u);
      break;
    }
    case "elfGuide": {
      const u = get(s, e.target);
      if (u) seatView(s, ownerOf(s, u)).used.push(`round:naith-guide:${u.id}`);
      break;
    }
    case "elfHandmaiden":
      lowerThreat(s, 1, { id: e.source, code: e.code });
      break;
    case "elfOrophin": {
      requireRule(!dikeCannotLeaveDiscard(s), DIKE_DISCARD_REASON);
      requireRule(
        s.discard[e.count!] === e.code,
        "Choose the Silvan ally in your discard pile.",
      );
      s.hand.push(takePlayerDiscard(s, e.count!));
      break;
    }
    case "elfSearchTake": {
      const index = e.count ?? -1,
        code = index >= 0 ? s.deck[index] : null;
      requireRule(
        index < 0 || (index < 5 && !!code),
        "Choose a card from the top five.",
      );
      const physical = code ? takePlayerDeck(s, index) : undefined;
      shuffle(s, s.deck);
      if (code) {
        const u = physical!;
        if (e.text === "silvan") enterAlly(s, u, false, false);
        else s.hand.push(u);
      }
      break;
    }
    case "elfRefugeeDiscard": {
      const u = get(s, e.target);
      if (u?.code === "06037") discardCharacter(s, u);
      break;
    }
    case "elfNaithResponse": {
      const u = get(s, e.target);
      if (u?.code === "08065" && u.exhausted)
        optional(
          s,
          "Defender of the Naith · Silvan ally left play",
          u.code,
          fx("elfReady", { target: u.id }),
          "Ready Defender of the Naith",
        );
      break;
    }
    case "elfWingfootNameResponse": {
      const { host, attachment } = liveAttachment(s, e, "08092");
      if (host && attachment && !attachment.exhausted)
        optional(
          s,
          "Wingfoot · Hero committed",
          "08092",
          { ...e, kind: "elfWingfootName" },
          "Name an encounter card type",
        );
      break;
    }
    case "elfWingfootName": {
      const { attachment } = liveAttachment(s, e, "08092");
      if (!attachment) break;
      choose(
        s,
        "Wingfoot · Name a card type",
        ["enemy", "location", "treachery"].map((type) => ({
          id: type,
          label: type[0].toUpperCase() + type.slice(1),
          effects: [{ ...e, kind: "elfWingfootNamed", text: type }],
        })),
      );
      break;
    }
    case "elfWingfootNamed":
      s.used.push(`phase:wingfoot:${e.source}:${e.text}`);
      break;
    case "elfWingfootReadyResponse": {
      const { host, attachment } = liveAttachment(s, e, "08092");
      if (host?.exhausted && attachment && !attachment.exhausted)
        optional(
          s,
          "Wingfoot · Named type revealed",
          "08092",
          { ...e, kind: "elfWingfootReady" },
          `Exhaust Wingfoot to ready ${name(host)}`,
          true,
        );
      break;
    }
    case "elfWingfootReady": {
      const { host, attachment } = liveAttachment(s, e, "08092");
      requireRule(
        host && attachment && !attachment.exhausted,
        "Wingfoot must be ready and attached.",
      );
      attachment.exhausted = true;
      readyCharacter(s, host);
      break;
    }
    default:
      return false;
  }
  return true;
}
