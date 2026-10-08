import { antleredRoutePiles } from "./antlered";
import { playerCardImmune } from "./card-immunity";
import { cannotReady } from "./core";
import { canGainResources } from "./core";
import { globalPlayerOrder } from "./table";
import { takePlayerDiscard } from "./board";
import { shadowFlameCanMove } from "./shadow-flame";
import { takePlayerDeck, putPlayerDeck } from "./core";
import { engagementCost } from "./core";
// Shadow and Flame: card-specific actions and responses, with explicit physical destinations.
import { card } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  canFight,
  canPay,
  choose,
  draw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  discardAttachment,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
  spendEvent,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  hasKeyword,
  ownerOf,
  seatView,
} from "./table";
import { isSacked } from "./carrock";
import {
  khazadCannotExhaust,
  khazadCanAttack,
  khazadCanRangedAttack,
} from "./khazad-dum";
import {
  rhosgobelCanFight,
  rhosgobelHeal,
  rhosgobelHealingAllowed,
  type HealSource,
} from "./rhosgobel";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  effectCardPlayProblem,
  playCardFromEffect,
  effectCardPlayTargets,
  needsTarget,
} from "./actions";
import { playerAttack } from "./combat";

const immune = (u: Unit) => playerCardImmune(u);
const stagingEnemies = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "enemy" && !immune(u));
const readyHeroes = (s: GameState) =>
  s.heroes.filter((u) => !u.exhausted && !khazadCannotExhaust(u));
const ranged = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      ownerOf(s, u) === activeSeat(s) &&
      !u.exhausted &&
      canFight(u) &&
      hasKeyword(u, "Ranged") &&
      stagingEnemies(s).some(
        (enemy) =>
          rhosgobelCanFight(enemy, u) &&
          khazadCanAttack(u) &&
          khazadCanRangedAttack(s, enemy, u, false),
      ),
  );
export const SHADOW_FLAME_ATTACHMENT_ACTIONS = ["04133", "04137"];

export function shadowFlamePlayerStats(s: GameState, u: Unit) {
  const will = globalPlayerOrder(s).reduce(
    (n, player) =>
      n +
      seatView(s, player).used.filter((k) => k === `round:miruvor:${u.id}`)
        .length,
    0,
  );
  return { will, attack: 0, defense: 0 };
}
export function shadowFlamePlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "04131" && !ranged(s).length)
    return "Hands Upon the Bow needs a ready Ranged character you control and a legal enemy in staging.";
  if (code === "04132")
    return "A Elbereth! Gilthoniel! responds after a non-unique enemy attacks you.";
  if (code === "04135" && (s.phase !== "refresh" || readyHeroes(s).length < 2))
    return "Peace, and Thought is a Refresh Action requiring two heroes you control able to exhaust.";
  if (code === "04136" && !s.encounterDeck.length)
    return "Risk Some Light needs an encounter deck card to inspect.";
  return null;
}
export const shadowFlamePlayerPlayTargets = (s: GameState, code: string) =>
  code === "04131" ? ranged(s) : null;
export function shadowFlamePlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["04131", "04135", "04136"].includes(code)) return false;
  requireRule(
    !shadowFlamePlayerPlayProblem(s, code),
    shadowFlamePlayerPlayProblem(s, code) ?? "",
  );
  if (code === "04131") {
    const attacker = ranged(s).find((u) => u.id === target);
    requireRule(
      attacker && exhaustCharacter(s, attacker),
      "Exhaust a Ranged character you control as this event's cost.",
    );
    choose(
      s,
      "Hands Upon the Bow · Staging enemy",
      opts(
        stagingEnemies(s).filter((enemy) => rhosgobelCanFight(enemy, attacker)),
        (enemy) => [
          fx("shadowFlameBowAttack", { source: attacker.id, target: enemy.id }),
        ],
      ),
    );
  }
  if (code === "04135")
    choose(
      s,
      "Peace, and Thought · First hero",
      opts(readyHeroes(s), (u) => [
        fx("shadowFlamePeaceFirst", { source: u.id }),
      ]),
    );
  if (code === "04136") {
    const looked = s.encounterDeck.splice(0, 3);
    choose(s, "Risk Some Light · Optional card to bottom", [
      ...looked.map((code, index) => ({
        id: `card-${index}`,
        label: card(code).name,
        code,
        effects: [fx("shadowFlameRiskBottom", { ids: looked, value: index })],
      })),
      {
        id: "none",
        label: "Leave all viewed cards on top",
        effects: [fx("shadowFlameRiskBottom", { ids: looked, value: -1 })],
      },
    ]);
  }
  return true;
}
export const shadowFlamePlayerAbilityLabel = (code: string) =>
  code === "04134" ? "Exhaust · search top five for an attachment" : undefined;
export function shadowFlamePlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (
      a?.code === "04137" &&
      (a.blanked ||
        a.facedown ||
        a.exhausted ||
        u.exhausted ||
        khazadCannotExhaust(u) ||
        !s.deck.length)
    )
      return "Vilya needs itself and Elrond ready, and a top deck card.";
    if (a?.code === "04133" && (a.blanked || a.facedown))
      return "Miruvor's printed text is inactive.";
    return undefined;
  }
  if (
    u.code === "04134" &&
    (u.exhausted || khazadCannotExhaust(u) || !s.deck.length)
  )
    return "Master of the Forge must be ready and have a deck card to search.";
  return undefined;
}
export function useShadowFlamePlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (!a || !SHADOW_FLAME_ATTACHMENT_ACTIONS.includes(a.code)) return false;
    requireRule(
      !shadowFlamePlayerAbilityProblem(s, u, a.id),
      shadowFlamePlayerAbilityProblem(s, u, a.id) ?? "",
    );
    if (a.code === "04133") {
      const owner = a.owner ?? attachmentController(s, u, a) ?? ownerOf(s, u);
      discardAttachment(s, u, a);
      const index = seatView(s, owner).discard.length - 1;
      miruvorChoose(s, {
        kind: "shadowFlameMiruvorChoose",
        target: u.id,
        owner,
        value: index,
        ids: [],
      });
    } else {
      requireRule(
        card(u.code).name === "Elrond" && exhaustCharacter(s, u),
        "Vilya exhausts its attached Elrond.",
      );
      a.exhausted = true;
      const code = s.deck[0];
      log(s, `Vilya reveals ${card(code).name}.`);
      prepend(s, fx("shadowFlameVilyaReveal", { code }));
    }
    return true;
  }
  if (u.code !== "04134") return false;
  requireRule(
    !shadowFlamePlayerAbilityProblem(s, u),
    shadowFlamePlayerAbilityProblem(s, u) ?? "",
  );
  requireRule(exhaustCharacter(s, u), "Master of the Forge cannot exhaust.");
  choose(s, "Master of the Forge · Top five", [
    ...s.deck.slice(0, 5).flatMap((code, index) =>
      card(code).type_code === "attachment"
        ? [
            {
              id: `card-${index}`,
              label: card(code).name,
              code,
              effects: [fx("shadowFlameForgeTake", { code, value: index })],
            },
          ]
        : [],
    ),
    {
      id: "none",
      label: "Take no attachment and shuffle",
      effects: [fx("shadowFlameForgeTake", { value: -1 })],
    },
  ]);
  return true;
}

export function shadowFlamePlayerHealed(
  s: GameState,
  target: Unit,
  amount: number,
  source: HealSource,
) {
  if (
    amount <= 0 ||
    !source.code ||
    source.code === "04128" ||
    !allCharacters(s).some((u) => u.id === target.id) ||
    !rhosgobelHealingAllowed(s, target)
  )
    return;
  prepend(
    s,
    ...allHeroes(s)
      .filter((u) => u.code === "04128" && !u.blanked && !isSacked(u))
      .map((u) =>
        fx("shadowFlameElrondResponse", {
          source: u.id,
          target: target.id,
          player: ownerOf(s, u),
        }),
      ),
  );
}
export function shadowFlamePlayerEnemyAttackEnded(
  s: GameState,
  enemy: Unit,
  defendingPlayer: number,
) {
  if (
    card(enemy.code).is_unique ||
    immune(enemy) ||
    !shadowFlameCanMove(s, enemy)
  )
    return;
  const p = seatView(s, defendingPlayer);
  if (p.hand.some((u) => u.code === "04132") && canPay(p, card("04132")))
    prepend(
      s,
      fx("shadowFlameElberethResponse", {
        target: enemy.id,
        player: defendingPlayer,
      }),
    );
}
function miruvorChoose(s: GameState, e: Effect) {
  const u = get(s, e.target),
    selected = e.ids ?? [];
  if (selected.length === 2) return;
  const modes = [
    {
      id: "ready",
      label: "Ready attached hero",
      valid: !!u?.exhausted && !cannotReady(u, s),
    },
    {
      id: "resource",
      label: "Add 1 resource to attached hero",
      valid: !!u && canGainResources(s, u),
    },
    { id: "will", label: "+1 willpower until end of round", valid: !!u },
    {
      id: "top",
      label: "Put Miruvor on top of its owner's deck",
      valid: seatView(s, e.owner ?? 0).discard[e.value ?? -1] === "04133",
    },
  ].filter((mode) => mode.valid && !selected.includes(mode.id));
  choose(
    s,
    "Miruvor · Choose two different benefits",
    modes.map((mode) => ({
      id: mode.id,
      label: mode.label,
      effects: [{ ...e, kind: "shadowFlameMiruvorApply", text: mode.id }],
    })),
  );
}
function riskOrder(s: GameState, remaining: string[], ordered: string[]) {
  if (!remaining.length) {
    s.encounterDeck.unshift(...ordered);
    return;
  }
  choose(
    s,
    "Risk Some Light · Next card on top",
    remaining.map((code, index) => ({
      id: `card-${index}`,
      label: card(code).name,
      code,
      effects: [
        fx("shadowFlameRiskOrder", {
          ids: remaining,
          text: JSON.stringify(ordered),
          value: index,
        }),
      ],
    })),
  );
}
function vilyaChoices(s: GameState, code: string) {
  const u = make(s, code),
    playProblem = effectCardPlayProblem(s, u, { putIntoPlay: false }),
    putProblem = effectCardPlayProblem(s, u, { putIntoPlay: true });
  choose(
    s,
    "Vilya · Revealed card",
    [
      ...(!playProblem
        ? [
            {
              id: "play",
              label: "Play at no cost",
              code,
              effects: [fx("shadowFlameVilyaChoose", { code, flag: false })],
            },
          ]
        : []),
      ...(!putProblem
        ? [
            {
              id: "put",
              label: "Put into play at no cost",
              code,
              effects: [fx("shadowFlameVilyaChoose", { code, flag: true })],
            },
          ]
        : []),
      {
        id: "bottom",
        label: "Move revealed card to bottom of deck",
        code,
        effects: [fx("shadowFlameVilyaBottom", { code })],
      },
    ],
    [playProblem, putProblem].filter(Boolean).join(" "),
  );
}
export function handleShadowFlamePlayerEffect(
  s: GameState,
  e: Effect,
): boolean {
  switch (e.kind) {
    case "shadowFlameBowAttack": {
      const attacker = get(s, e.source),
        enemy = stagingEnemies(s).find((u) => u.id === e.target);
      requireRule(
        attacker && enemy,
        "The paid attacker and staging enemy must remain in play.",
      );
      playerAttack(s, enemy, [attacker.id], false, "hands-upon-bow");
      return true;
    }
    case "shadowFlamePeaceFirst": {
      const hero = readyHeroes(s).find((u) => u.id === e.source);
      requireRule(
        hero && exhaustCharacter(s, hero),
        "Choose an eligible first hero.",
      );
      choose(
        s,
        "Peace, and Thought · Second hero",
        opts(
          readyHeroes(s).filter((u) => u.id !== hero.id),
          (u) => [fx("shadowFlamePeaceSecond", { source: u.id })],
        ),
      );
      return true;
    }
    case "shadowFlamePeaceSecond": {
      const hero = readyHeroes(s).find((u) => u.id === e.source);
      requireRule(
        hero && exhaustCharacter(s, hero),
        "Choose a different eligible second hero.",
      );
      draw(s, 5);
      return true;
    }
    case "shadowFlameForgeTake": {
      const index = e.value ?? -1;
      if (index >= 0) {
        requireRule(
          index < 5 &&
            s.deck[index] === e.code &&
            card(e.code!).type_code === "attachment",
          "Choose an attachment from the original top five.",
        );
        s.hand.push(takePlayerDeck(s, index));
      }
      shuffle(s, s.deck);
      return true;
    }
    case "shadowFlameRiskBottom": {
      const remaining = [...(e.ids ?? [])],
        index = e.value ?? -1;
      if (index >= 0) {
        requireRule(
          index < remaining.length,
          "Choose an original viewed card.",
        );
        s.encounterDeck.push(remaining.splice(index, 1)[0]);
      }
      riskOrder(s, remaining, []);
      return true;
    }
    case "shadowFlameRiskOrder": {
      const remaining = [...(e.ids ?? [])],
        ordered = JSON.parse(e.text ?? "[]") as string[],
        index = e.value ?? -1;
      requireRule(
        index >= 0 && index < remaining.length,
        "Choose an original unselected card.",
      );
      ordered.push(remaining.splice(index, 1)[0]);
      riskOrder(s, remaining, ordered);
      return true;
    }
    case "shadowFlameMiruvorApply": {
      const u = get(s, e.target),
        chosen = e.ids ?? [],
        mode = e.text ?? "";
      requireRule(
        !chosen.includes(mode),
        "Choose two distinct Miruvor benefits.",
      );
      if (mode === "ready") {
        requireRule(
          u?.exhausted && !cannotReady(u, s),
          "The hero must be able to ready.",
        );
        readyCharacter(s, u);
      }
      if (mode === "resource") {
        requireRule(
          u && canGainResources(s, u),
          "The hero must be able to gain resources.",
        );
        u.resources++;
        gondorResourcesGained(s, u, 1, true);
      }
      if (mode === "will") {
        requireRule(u, "The attached hero must remain in play.");
        s.used.push(`round:miruvor:${u.id}`);
      }
      if (mode === "top")
        forOwner(s, e.owner ?? 0, () => {
          requireRule(
            s.discard[e.value ?? -1] === "04133",
            "The actual discarded Miruvor must remain available.",
          );
          putPlayerDeck(s, takePlayerDiscard(s, e.value!), 0);
        });
      miruvorChoose(s, { ...e, ids: [...chosen, mode] });
      return true;
    }
    case "shadowFlameElrondResponse": {
      const hero = get(s, e.source),
        target = get(s, e.target);
      if (
        hero?.code === "04128" &&
        !hero.blanked &&
        !isSacked(hero) &&
        target &&
        rhosgobelHealingAllowed(s, target)
      )
        choose(s, "Elrond · After another card heals", [
          {
            id: "heal",
            label: "Heal 1 additional damage",
            code: hero.code,
            effects: [
              fx("shadowFlameElrondHeal", {
                source: hero.id,
                target: target.id,
              }),
            ],
          },
          skip,
        ]);
      return true;
    }
    case "shadowFlameElrondHeal": {
      const hero = get(s, e.source),
        target = get(s, e.target);
      requireRule(
        hero?.code === "04128" && !hero.blanked && !isSacked(hero) && target,
        "Elrond and the healed character must remain in play.",
      );
      rhosgobelHeal(s, target, 1, {
        source: hero.id,
        code: hero.code,
        player: ownerOf(s, hero),
      });
      return true;
    }
    case "shadowFlameElberethResponse": {
      const enemy = get(s, e.target);
      if (
        enemy &&
        card(enemy.code).type_code === "enemy" &&
        !card(enemy.code).is_unique &&
        !immune(enemy) &&
        shadowFlameCanMove(s, enemy) &&
        s.hand.some((u) => u.code === "04132") &&
        canPay(s, card("04132"))
      )
        choose(s, "A Elbereth! Gilthoniel! · Enemy attacked you", [
          {
            id: "play",
            label: "Put enemy on bottom of encounter deck",
            code: "04132",
            effects: [fx("shadowFlameElberethBottom", { target: enemy.id })],
          },
          skip,
        ]);
      return true;
    }
    case "shadowFlameElberethBottom": {
      const enemy = get(s, e.target);
      requireRule(
        enemy &&
          !card(enemy.code).is_unique &&
          !immune(enemy) &&
          shadowFlameCanMove(s, enemy),
        "The movable non-unique attacking enemy must remain in play.",
      );
      if (!spendEvent(s, "04132")) return true;
      const engagement = engagementCost(s, enemy);
      for (const a of [...enemy.attachments])
        discardAttachment(s, enemy, a, true);
      s.encounterDiscard.push(...enemy.shadows);
      enemy.shadows = [];
      delete enemy.faceupShadows;
      enemy.revealedShadowCount = 0;
      const controller = ownerOf(s, enemy);
      forOwner(s, controller, () => {
        s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
      });
      s.staging = s.staging.filter((u) => u.id !== enemy.id);
      if (s.antlered) {
        s.encounterDiscard.push(enemy.code);
        antleredRoutePiles(s);
      } else s.encounterDeck.push(enemy.code);
      if (s.threat < engagement)
        raiseThreat(s, engagement - s.threat, "player-card");
      return true;
    }
    case "shadowFlameVilyaReveal":
      requireRule(
        s.deck[0] === e.code,
        "Vilya must resolve the original revealed top card.",
      );
      vilyaChoices(s, e.code!);
      return true;
    case "shadowFlameVilyaBottom":
      requireRule(
        s.deck[0] === e.code,
        "The revealed card must remain on top.",
      );
      putPlayerDeck(s, takePlayerDeck(s));
      return true;
    case "shadowFlameVilyaChoose": {
      const u = make(s, e.code!);
      requireRule(
        !effectCardPlayProblem(s, u, { putIntoPlay: !!e.flag }),
        "The revealed card is no longer legal.",
      );
      if (needsTarget(u))
        choose(
          s,
          "Vilya · Card target",
          effectCardPlayTargets(s, u, { putIntoPlay: !!e.flag }).map(
            (target) => ({
              id: target.id,
              label: card(target.code).name,
              code: target.code,
              effects: [
                { ...e, kind: "shadowFlameVilyaPlay", target: target.id },
              ],
            }),
          ),
        );
      else prepend(s, { ...e, kind: "shadowFlameVilyaPlay" });
      return true;
    }
    case "shadowFlameVilyaPlay":
      playCardFromEffect(s, make(s, e.code!), {
        putIntoPlay: !!e.flag,
        target: e.target,
      });
      return true;
    default:
      return false;
  }
}
